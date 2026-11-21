import { signMediaPaths } from "./storageUrls";
import { supabase } from "./supabase";

interface MemberRow {
  id: string;
  username: string | null;
  avatar_path: string | null;
  is_private: boolean;
}

type FollowState = "none" | "requested" | "following";

interface ProfileRow extends MemberRow {
  bio: string;
  can_view: boolean;
  followers: number;
  following: number;
  relationship: FollowState;
}

export interface Member {
  id: string;
  username: string | null;
  avatar: string | null;
  privateAccount: boolean;
}

export interface MemberProfile extends Member {
  bio: string;
  canView: boolean;
  followers: number;
  following: number;
  relationship: FollowState;
}

function client() {
  if (!supabase)
    throw new Error(
      "Sign in to a connected Worth It? account to use this feature.",
    );
  return supabase;
}

async function rpc<T>(name: string, args?: Record<string, string | boolean>) {
  const { data, error } = await client().rpc(name, args);
  if (error?.code === "PGRST202")
    throw new Error("Spot and follows are still being set up on the server.");
  if (error) throw new Error(error.message);
  return data as T;
}

async function describe<T extends MemberRow>(rows: T[]) {
  const avatars = await signMediaPaths(
    client(),
    "social-media",
    rows.map((row) => row.avatar_path),
  );
  return rows.map((row) => ({
    row,
    member: {
      id: row.id,
      username: row.username,
      privateAccount: row.is_private,
      avatar: avatars.get(row.avatar_path ?? "") ?? null,
    } satisfies Member,
  }));
}

export async function findMembers(query: string) {
  return (
    await describe(
      await rpc<MemberRow[]>("search_social_profiles", { p_query: query }),
    )
  ).map(({ member }) => member);
}

export async function getMemberProfile(
  id: string,
): Promise<MemberProfile | null> {
  const [result] = await describe(
    await rpc<ProfileRow[]>("social_profile_card", { p_id: id }),
  );
  if (!result) return null;
  const { row, member } = result;
  return {
    ...member,
    bio: row.bio,
    canView: row.can_view,
    followers: Number(row.followers),
    following: Number(row.following),
    relationship: row.relationship,
  };
}

export async function getFollowRequests() {
  return (
    await describe(await rpc<MemberRow[]>("list_social_follow_requests"))
  ).map(({ member }) => member);
}

export async function getAccountPrivacy(userId: string) {
  const { data, error } = await client()
    .from("social_profiles")
    .select("is_private")
    .eq("id", userId)
    .maybeSingle();
  if (error?.code === "42703" || error?.code === "PGRST204")
    throw new Error("Account privacy is still being set up on the server.");
  if (error) throw new Error(error.message);
  return typeof data?.is_private === "boolean" ? data.is_private : null;
}

export const followMember = (id: string, follow: boolean) =>
  rpc<null>("set_social_follow", { p_id: id, p_follow: follow });
export const respondToFollow = (id: string, accept: boolean) =>
  rpc<null>("respond_social_follow", { p_id: id, p_accept: accept });
export const changePrivacy = (privateAccount: boolean) =>
  rpc<null>("set_social_privacy", { p_private: privateAccount });

export async function getConnections(
  id: string,
  kind: "followers" | "following",
  after?: string,
) {
  return (
    await describe(
      await rpc<MemberRow[]>("worthit_connections", {
        p_id: id,
        p_kind: kind,
        ...(after ? { p_after: after } : {}),
      }),
    )
  ).map(({ member }) => member);
}
