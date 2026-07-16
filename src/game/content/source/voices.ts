import { VoiceId } from "@/src/game/content/dialogue/voices.ts";

export const SHIPPED_VOICE_SOURCES: Readonly<Record<VoiceId, string>> = {
  [VoiceId.JohnThanksGreet]: new URL(
    "../../../../assets/game/audio/dialogue/john_thanks_greet.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnThanksCodes]: new URL(
    "../../../../assets/game/audio/dialogue/john_thanks_codes.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnThanksFamily]: new URL(
    "../../../../assets/game/audio/dialogue/john_thanks_family.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnNexusGreet]: new URL(
    "../../../../assets/game/audio/dialogue/john_nexus_greet.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnNexusNexus]: new URL(
    "../../../../assets/game/audio/dialogue/john_nexus_nexus.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnNexusCore]: new URL(
    "../../../../assets/game/audio/dialogue/john_nexus_core.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnNexusWarning]: new URL(
    "../../../../assets/game/audio/dialogue/john_nexus_warning.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnCoreGreet]: new URL(
    "../../../../assets/game/audio/dialogue/john_core_greet.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnCoreTurret]: new URL(
    "../../../../assets/game/audio/dialogue/john_core_turret.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnCoreReboot]: new URL(
    "../../../../assets/game/audio/dialogue/john_core_reboot.wav",
    import.meta.url,
  ).href,
};
