import { EmptyState } from "@/components/EmptyState";
import { ThreadsIcon } from "@/components/icons";

export default function ThreadsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Threads</h1>
      <EmptyState
        icon={<ThreadsIcon className="h-7 w-7" />}
        title="Messages from your upline appear here"
        body="Announcements, motivation and techniques from your line — with one-tap acknowledge. Coming in the next update."
      />
    </div>
  );
}
