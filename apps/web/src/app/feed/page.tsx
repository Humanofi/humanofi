// ========================================
// Humanofi — Feed Redirect
// ========================================
// /feed now redirects to / (the unified feed homepage)
// This ensures old bookmarks and links still work.

import { redirect } from "next/navigation";

export default function FeedRedirect() {
  redirect("/");
}
