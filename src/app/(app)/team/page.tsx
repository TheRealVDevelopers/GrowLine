import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { buildTeamTree } from "@/lib/team";
import TeamTreeView from "./TeamTreeView";

export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const tree = await buildTeamTree(user.id);
  if (!tree) redirect("/login");

  return <TeamTreeView initialTree={tree} inviteCode={user.referralCode} />;
}
