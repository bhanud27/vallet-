import { optionalRpc, readableRpcError, type RpcClient } from "./backendRpc";
export interface SocialNotification {
  id: string;
  kind:
    | "post_comment"
    | "poll_vote"
    | "poll_star"
    | "post_star"
    | "reel_star"
    | "poll_mention"
    | "reel_mention"
    | "feature_announcement"
    | "important_update"
    | "poll_comment"
    | "reel_comment"
    | "follow_request"
    | "follow"
    | "purchase_update"
    | "after_buy_reminder";
  target_id: string;
  username: string;
  detail: string;
  created_at: string;
}
export async function notificationData(client: RpcClient) {
  const { data, error } = await client.rpc("list_social_notifications");
  if (error)
    throw new Error(
      readableRpcError(
        error,
        "Could not load notifications. Please try again.",
      ),
    );
  const items = (data || []) as SocialNotification[];
  try {
    const result = await optionalRpc<string | null>(
      client,
      "worthit_notification_read",
      {
        p_mark: false,
      },
    );
    return {
      items,
      readAvailable: result.available,
      readAt: result.available ? result.data : null,
      warning: "",
    };
  } catch (error) {
    return {
      items,
      readAvailable: false,
      readAt: null,
      warning: readableRpcError(
        error,
        "Notifications loaded, but read status could not be checked. Please refresh to retry.",
      ),
    };
  }
}
export async function markNotificationsRead(client: RpcClient) {
  return optionalRpc<string>(client, "worthit_notification_read", {
    p_mark: true,
  });
}
