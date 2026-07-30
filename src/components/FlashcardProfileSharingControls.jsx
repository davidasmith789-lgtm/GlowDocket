import { GAMIFICATION_ACHIEVEMENTS, getGamificationLevel } from "../gamificationUtils.js";
import { buildFlashcardProfileTags } from "../flashcardUtils.js";
import FlashcardProfileChip from "./FlashcardProfileChip.jsx";
import "./FlashcardProfileSharingControls.css";

export default function FlashcardProfileSharingControls({ profileSettings = {}, onChange = () => {}, level = 1, displayName = "", inline = false }) {
  const earnedBadges = GAMIFICATION_ACHIEVEMENTS.filter((badge) => (profileSettings.earnedAchievementIds || []).includes(badge.id));
  const badgeId = !profileSettings.sharedFlashcardBadge || profileSettings.sharedFlashcardBadge === "current"
    ? profileSettings.selectedBadge || ""
    : profileSettings.sharedFlashcardBadge;
  const preview = buildFlashcardProfileTags([], {
    shareFlashcardLevel: profileSettings.shareFlashcardLevel === true,
    shareFlashcardBadge: profileSettings.shareFlashcardBadge === true,
    showFlashcardName: profileSettings.showFlashcardName === true,
    badgeId,
    level,
    name: displayName,
  });
  const levelName = getGamificationLevel(profileSettings.totalXp).name;
  const sharesAnything = profileSettings.shareFlashcardLevel === true || profileSettings.shareFlashcardBadge === true || profileSettings.showFlashcardName === true;
  const content = (
    <div className="flash-profile-sharing-content">
        <p>Choose exactly what appears on Shared Decks and Community posts. Changes save automatically.</p>
        <fieldset>
          <legend>Information other users can see</legend>
          <label><input type="checkbox" checked={profileSettings.shareFlashcardLevel === true} onChange={(event) => onChange({ shareFlashcardLevel: event.target.checked })} /><span><strong>Share level</strong><small>Show Level {level} · {levelName}.</small></span></label>
          <label><input type="checkbox" checked={profileSettings.shareFlashcardBadge === true} onChange={(event) => onChange({ shareFlashcardBadge: event.target.checked })} /><span><strong>Share badge</strong><small>Show the badge selected below.</small></span></label>
          <label><input type="checkbox" checked={profileSettings.showFlashcardName === true} onChange={(event) => onChange({ showFlashcardName: event.target.checked })} /><span><strong>Share account name</strong><small>Show {displayName || "your account name"} beside the selected details.</small></span></label>
        </fieldset>
        <label className={`flash-profile-badge-choice${profileSettings.shareFlashcardBadge === true ? "" : " is-disabled"}`}><span><strong>Badge other users see</strong><small>Choose Current to follow the badge selected in your account.</small></span><select disabled={profileSettings.shareFlashcardBadge !== true} value={profileSettings.sharedFlashcardBadge || "current"} onChange={(event) => onChange({ sharedFlashcardBadge: event.target.value })}><option value="current">Current</option>{earnedBadges.map((badge) => <option key={badge.id} value={badge.id}>{badge.title}</option>)}</select></label>
        <section className="flash-profile-sharing-preview" aria-label="Public profile preview">
          <span>What other users will see</span>
          {sharesAnything && preview.length > 0 ? <FlashcardProfileChip tags={preview} /> : <strong>Nothing from your profile will be shared.</strong>}
        </section>
    </div>
  );
  if (inline) return <div className="flash-profile-sharing is-inline">{content}</div>;
  return <details className="flash-profile-sharing"><summary>Profile sharing</summary>{content}</details>;
}
