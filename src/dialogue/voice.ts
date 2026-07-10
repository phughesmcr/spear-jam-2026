export const VoiceId = {
  JohnThanksGreet: "johnThanksGreet",
  JohnThanksCodes: "johnThanksCodes",
  JohnThanksFamily: "johnThanksFamily",
  JohnNexusGreet: "johnNexusGreet",
  JohnNexusNexus: "johnNexusNexus",
  JohnNexusCore: "johnNexusCore",
  JohnNexusWarning: "johnNexusWarning",
} as const;
export type VoiceId = (typeof VoiceId)[keyof typeof VoiceId];

export const VOICE_IDS = Object.values(VoiceId);

export const VOICE_CATALOG: Readonly<Record<VoiceId, string>> = {
  [VoiceId.JohnThanksGreet]: new URL(
    "../../assets/game/audio/dialogue/john_thanks_greet.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnThanksCodes]: new URL(
    "../../assets/game/audio/dialogue/john_thanks_codes.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnThanksFamily]: new URL(
    "../../assets/game/audio/dialogue/john_thanks_family.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnNexusGreet]: new URL(
    "../../assets/game/audio/dialogue/john_nexus_greet.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnNexusNexus]: new URL(
    "../../assets/game/audio/dialogue/john_nexus_nexus.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnNexusCore]: new URL(
    "../../assets/game/audio/dialogue/john_nexus_core.wav",
    import.meta.url,
  ).href,
  [VoiceId.JohnNexusWarning]: new URL(
    "../../assets/game/audio/dialogue/john_nexus_warning.wav",
    import.meta.url,
  ).href,
};

export function voiceSource(voiceId: VoiceId): string {
  return VOICE_CATALOG[voiceId];
}
