import { ActiveSession } from "@/components/logger/active-session";

/**
 * The logger. `sessionId` is a client-generated UUIDv7, so this URL exists the
 * moment the workout starts and survives a reload, a tab close, or a different
 * device.
 */
export default async function SessionPage({ params }: PageProps<"/train/[sessionId]">) {
  const { sessionId } = await params;
  return <ActiveSession sessionId={sessionId} />;
}
