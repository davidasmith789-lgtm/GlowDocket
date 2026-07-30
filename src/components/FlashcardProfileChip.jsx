import AchievementEmblem from "./AchievementEmblem.jsx";
import { parseFlashcardProfile } from "../flashcardUtils.js";
import { getGamificationLevel } from "../gamificationUtils.js";
import "./FlashcardProfileChip.css";

export default function FlashcardProfileChip({ tags = [], compact = false }) {
  const profile = parseFlashcardProfile(tags);
  if (!profile.level && !profile.badgeId && !profile.name) return null;
  return (
    <div className={`flash-public-profile${compact ? " is-compact" : ""}`} aria-label={`${profile.name || "GlowDocket student"}${profile.level ? `, Flashcards level ${profile.level}` : ""}${profile.badgeId ? ", shared badge" : ""}`}>
      {profile.badgeId && <span className={`flash-public-profile-badge badge-${profile.badgeId}`} aria-hidden="true"><AchievementEmblem id={profile.badgeId} /></span>}
      <span>
        {profile.name && <strong>{profile.name}</strong>}
        {profile.level && <small>{getGamificationLevel((profile.level - 1) * 100).name} · Level {profile.level}</small>}
        {!profile.level && profile.badgeId && <small>Shared badge</small>}
      </span>
    </div>
  );
}
