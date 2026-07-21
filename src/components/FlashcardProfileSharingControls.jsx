import { GAMIFICATION_ACHIEVEMENTS } from "../gamificationUtils.js";
import { buildFlashcardProfileTags } from "../flashcardUtils.js";
import FlashcardProfileChip from "./FlashcardProfileChip.jsx";
import "./FlashcardProfileSharingControls.css";

export default function FlashcardProfileSharingControls({ profileSettings = {}, onChange = () => {}, level = 1, displayName = "" }) {
  const earnedBadges = GAMIFICATION_ACHIEVEMENTS.filter((badge) => (profileSettings.earnedAchievementIds || []).includes(badge.id));
  const badgeId = !profileSettings.sharedFlashcardBadge || profileSettings.sharedFlashcardBadge === "current"
    ? profileSettings.selectedBadge || ""
    : profileSettings.sharedFlashcardBadge;
  const preview = buildFlashcardProfileTags([], {
    shareFlashcardLevel: profileSettings.shareFlashcardLevel === true,
    showFlashcardName: profileSettings.showFlashcardName === true,
    badgeId,
    level,
    name: displayName,
  });
  return (
    <details className="flash-profile-sharing">
      <summary>Share Flashcard level &amp; badge</summary>
      <label><span>Show my Flashcards level and badge on Shared Decks and Community posts</span><input type="checkbox" checked={profileSettings.shareFlashcardLevel === true} onChange={(event) => onChange({ shareFlashcardLevel: event.target.checked })} /></label>
      <label><span>Badge shown with my level</span><select value={profileSettings.sharedFlashcardBadge || "current"} onChange={(event) => onChange({ sharedFlashcardBadge: event.target.value })}><option value="current">Current</option>{earnedBadges.map((badge) => <option key={badge.id} value={badge.id}>{badge.title}</option>)}</select></label>
      <label><span>Show my account name publicly</span><input type="checkbox" checked={profileSettings.showFlashcardName === true} onChange={(event) => onChange({ showFlashcardName: event.target.checked })} /></label>
      <FlashcardProfileChip tags={preview} />
    </details>
  );
}
