import type { ImageAssetIssue, ImageAssetResult } from "@/src/engine/canvas/mod.ts";
import type { CompiledLevel } from "@/src/game/content/catalog.ts";
import {
  type AssetBundleDependencies,
  type AssetBundleJob,
  type AssetBundleRequest,
  selectAssetBundleJobs,
} from "@/src/game/presentation/asset_bundles.ts";
import { createPresentationAssetView, type PresentationAssetView } from "@/src/game/presentation/asset_view.ts";
import { createFirstPersonAssets } from "@/src/game/presentation/first_person/assets/mod.ts";

export type PresentationAssetRequest = AssetBundleRequest;

export type AssetProgress = {
  readonly completed: number;
  readonly total: number;
};

export type AssetIssue = {
  readonly source: string;
  readonly stage: "load" | "bake";
};

export type AssetPreparation =
  | { readonly kind: "ready" }
  | { readonly kind: "degraded"; readonly unavailable: readonly AssetIssue[] };

export type PrepareAssetsOptions = {
  readonly urgency: "blocking" | "idle";
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: AssetProgress) => void;
};

export interface PresentationAssetIdleScheduler {
  schedule(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

export type PresentationAssetsSpec = {
  readonly document: Document;
  readonly content: AssetBundleDependencies["content"];
  readonly simulationContent: AssetBundleDependencies["simulationContent"];
  readonly idle: PresentationAssetIdleScheduler;
  readonly onAssetChange?: () => void;
};

export interface PresentationAssets extends Disposable {
  prepare(
    request: PresentationAssetRequest,
    options: PrepareAssetsOptions,
  ): Promise<AssetPreparation>;
  view(): PresentationAssetView;
}

type RequestPhase =
  | { readonly type: "idle" }
  | { readonly type: "scheduled"; readonly handle: unknown }
  | { readonly type: "preparing" }
  | { readonly type: "terminal"; readonly result: AssetPreparation }
  | { readonly type: "failed"; readonly error: unknown };

type RequestRecord = {
  readonly jobs: readonly AssetBundleJob[];
  readonly subscribers: Set<RequestSubscriber>;
  phase: RequestPhase;
  completed: number;
};

type RequestSubscriber = {
  readonly resolve: (result: AssetPreparation) => void;
  readonly reject: (error: unknown) => void;
  readonly onProgress?: (progress: AssetProgress) => void;
  readonly signal?: AbortSignal;
  abortListener?: () => void;
};

type HostIdleHandle =
  | { readonly kind: "idle"; readonly id: number }
  | { readonly kind: "timeout"; readonly id: number };

export function createPresentationAssetIdleScheduler(host: Window): PresentationAssetIdleScheduler {
  return {
    schedule(callback): HostIdleHandle {
      if (typeof host.requestIdleCallback === "function") {
        return { kind: "idle", id: host.requestIdleCallback(callback) };
      }
      return { kind: "timeout", id: host.setTimeout(callback, 0) };
    },
    cancel(handle): void {
      const scheduled = handle as HostIdleHandle;
      if (scheduled.kind === "idle") {
        host.cancelIdleCallback(scheduled.id);
        return;
      }
      host.clearTimeout(scheduled.id);
    },
  };
}

export function createPresentationAssets(spec: PresentationAssetsSpec): PresentationAssets {
  return new Runtime(spec);
}

class Runtime implements PresentationAssets {
  private readonly spec: PresentationAssetsSpec;
  private readonly assetView: PresentationAssetView;
  private readonly dependencies: AssetBundleDependencies;
  private readonly records = new Set<RequestRecord>();
  private readonly levelRecords = new WeakMap<CompiledLevel, RequestRecord>();
  private readonly deferredRecords = new WeakMap<CompiledLevel, RequestRecord>();
  private shellRecord?: RequestRecord;
  private disposed = false;

  constructor(spec: PresentationAssetsSpec) {
    this.spec = spec;
    const firstPerson = createFirstPersonAssets();
    this.assetView = createPresentationAssetView(firstPerson.view);
    this.dependencies = {
      document: spec.document,
      view: this.assetView,
      firstPersonLoader: firstPerson.loader,
      content: spec.content,
      simulationContent: spec.simulationContent,
      announcedReadyAssets: new WeakSet(),
    };
  }

  view(): PresentationAssetView {
    return this.assetView;
  }

  prepare(
    request: PresentationAssetRequest,
    options: PrepareAssetsOptions,
  ): Promise<AssetPreparation> {
    if (this.disposed) return Promise.reject(disposedError());
    if (options.signal?.aborted === true) return Promise.reject(abortReason(options.signal));

    const record = this.recordFor(request);
    const promise = this.subscribe(record, options);
    if (options.urgency === "blocking") {
      this.startBlocking(record);
    } else if (record.phase.type === "idle") {
      this.schedule(record);
    }
    return promise;
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = disposedError();
    for (const record of this.records) {
      if (record.phase.type === "scheduled") this.spec.idle.cancel(record.phase.handle);
      for (const subscriber of [...record.subscribers]) {
        this.rejectSubscriber(record, subscriber, error);
      }
    }
  }

  private recordFor(request: PresentationAssetRequest): RequestRecord {
    switch (request.kind) {
      case "shell": {
        this.shellRecord ??= this.createRecord(request);
        return this.shellRecord;
      }
      case "level": {
        const existing = this.levelRecords.get(request.level);
        if (existing !== undefined) return existing;
        const created = this.createRecord(request);
        this.levelRecords.set(request.level, created);
        return created;
      }
      case "deferred": {
        const existing = this.deferredRecords.get(request.level);
        if (existing !== undefined) return existing;
        const created = this.createRecord(request);
        this.deferredRecords.set(request.level, created);
        return created;
      }
    }
  }

  private createRecord(request: PresentationAssetRequest): RequestRecord {
    const record: RequestRecord = {
      jobs: selectAssetBundleJobs(request, this.dependencies),
      subscribers: new Set(),
      phase: { type: "idle" },
      completed: 0,
    };
    this.records.add(record);
    return record;
  }

  private subscribe(
    record: RequestRecord,
    options: PrepareAssetsOptions,
  ): Promise<AssetPreparation> {
    const phase = record.phase;
    if (phase.type === "terminal") {
      options.onProgress?.(progressFor(record));
      return Promise.resolve(phase.result);
    }
    if (phase.type === "failed") {
      options.onProgress?.(progressFor(record));
      return Promise.reject(phase.error);
    }

    const { promise, resolve, reject } = Promise.withResolvers<AssetPreparation>();
    const subscriber: RequestSubscriber = {
      resolve,
      reject,
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
    const signal = options.signal;
    if (signal !== undefined) {
      subscriber.abortListener = () => {
        this.rejectSubscriber(record, subscriber, abortReason(signal));
      };
      signal.addEventListener("abort", subscriber.abortListener, { once: true });
    }
    record.subscribers.add(subscriber);
    this.reportToSubscriber(record, subscriber);
    return promise;
  }

  private schedule(record: RequestRecord): void {
    const handle = this.spec.idle.schedule(() => {
      if (this.disposed) return;
      if (record.phase.type !== "scheduled" || record.phase.handle !== handle) return;
      this.start(record);
    });
    record.phase = { type: "scheduled", handle };
  }

  private startBlocking(record: RequestRecord): void {
    if (record.phase.type === "scheduled") {
      this.spec.idle.cancel(record.phase.handle);
      record.phase = { type: "idle" };
    }
    if (record.phase.type === "idle") this.start(record);
  }

  private start(record: RequestRecord): void {
    if (this.disposed || (record.phase.type !== "idle" && record.phase.type !== "scheduled")) return;
    record.phase = { type: "preparing" };
    void this.run(record);
  }

  private async run(record: RequestRecord): Promise<void> {
    try {
      const results = await Promise.all(record.jobs.map(async (job) => {
        const result = await job(() => {
          this.publishAssetChange(record);
        });
        if (!this.disposed && record.phase.type === "preparing") {
          record.completed += 1;
          this.publishProgress(record);
        }
        return result;
      }));
      if (this.disposed || record.phase.type !== "preparing") return;
      const result = preparationFor(results.flat());
      record.phase = { type: "terminal", result };
      for (const subscriber of [...record.subscribers]) {
        this.resolveSubscriber(record, subscriber, result);
      }
    } catch (error) {
      if (this.disposed || record.phase.type !== "preparing") return;
      record.phase = { type: "failed", error };
      for (const subscriber of [...record.subscribers]) {
        this.rejectSubscriber(record, subscriber, error);
      }
    }
  }

  private publishProgress(record: RequestRecord): void {
    for (const subscriber of [...record.subscribers]) this.reportToSubscriber(record, subscriber);
  }

  private publishAssetChange(record: RequestRecord): void {
    if (this.disposed || record.subscribers.size === 0 || this.spec.onAssetChange === undefined) return;
    try {
      this.spec.onAssetChange();
    } catch (error) {
      console.error("Presentation asset change callback failed.", error);
    }
  }

  private reportToSubscriber(record: RequestRecord, subscriber: RequestSubscriber): void {
    try {
      subscriber.onProgress?.(progressFor(record));
    } catch (error) {
      this.rejectSubscriber(record, subscriber, error);
    }
  }

  private resolveSubscriber(
    record: RequestRecord,
    subscriber: RequestSubscriber,
    result: AssetPreparation,
  ): void {
    if (!record.subscribers.delete(subscriber)) return;
    removeAbortListener(subscriber);
    subscriber.resolve(result);
  }

  private rejectSubscriber(
    record: RequestRecord,
    subscriber: RequestSubscriber,
    error: unknown,
  ): void {
    if (!record.subscribers.delete(subscriber)) return;
    removeAbortListener(subscriber);
    subscriber.reject(error);
  }
}

function progressFor(record: RequestRecord): AssetProgress {
  return Object.freeze({ completed: record.completed, total: record.jobs.length });
}

function preparationFor(results: readonly ImageAssetResult[]): AssetPreparation {
  const unavailable = new Map<string, AssetIssue>();
  for (const result of results) {
    if (result.kind !== "unavailable") continue;
    const issue = assetIssue(result.issue);
    unavailable.set(`${issue.stage}:${issue.source}`, issue);
  }
  if (unavailable.size === 0) return Object.freeze({ kind: "ready" });
  const issues = [...unavailable.values()].toSorted((left, right) =>
    left.source.localeCompare(right.source) || left.stage.localeCompare(right.stage)
  );
  return Object.freeze({ kind: "degraded", unavailable: Object.freeze(issues) });
}

function assetIssue(issue: ImageAssetIssue): AssetIssue {
  return Object.freeze({ source: issue.source, stage: issue.stage });
}

function removeAbortListener(subscriber: RequestSubscriber): void {
  if (subscriber.signal === undefined || subscriber.abortListener === undefined) return;
  subscriber.signal.removeEventListener("abort", subscriber.abortListener);
  subscriber.abortListener = undefined;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Asset preparation aborted.", "AbortError");
}

function disposedError(): DOMException {
  return new DOMException("Presentation assets disposed.", "AbortError");
}
