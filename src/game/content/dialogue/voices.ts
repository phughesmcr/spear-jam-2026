export const VoiceId = {
  JohnThanksGreet: "johnThanksGreet",
  JohnThanksCodes: "johnThanksCodes",
  JohnThanksFamily: "johnThanksFamily",
  JohnNexusGreet: "johnNexusGreet",
  JohnNexusNexus: "johnNexusNexus",
  JohnNexusCore: "johnNexusCore",
  JohnNexusWarning: "johnNexusWarning",
  JohnCoreGreet: "johnCoreGreet",
  JohnCoreTurret: "johnCoreTurret",
  JohnCoreReboot: "johnCoreReboot",
} as const;
export type VoiceId = (typeof VoiceId)[keyof typeof VoiceId];

export const VOICE_IDS = Object.values(VoiceId);
