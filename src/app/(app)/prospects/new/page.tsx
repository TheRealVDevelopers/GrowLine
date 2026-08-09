import Link from "next/link";
import NewProspectForm from "./NewProspectForm";
import { BackIcon } from "@/components/icons";

export default function NewProspectPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/prospects"
        className="flex h-12 items-center gap-2 self-start font-medium text-gold-600"
      >
        <BackIcon className="h-5 w-5" />
        Back
      </Link>
      <h1 className="text-2xl font-bold">New Person</h1>
      <NewProspectForm />
    </div>
  );
}
