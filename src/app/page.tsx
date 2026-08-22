import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex items-center gap-2.5">
        <span className="size-2 rounded-full bg-brand" />
        <span className="text-xl font-semibold tracking-tight lowercase">
          hookai
        </span>
      </div>

      <div className="space-y-3">
        <h1 className="font-narrative text-4xl leading-[1.1] text-balance">
          A simulation engine for human relationships.
        </h1>
        <p className="text-sm text-muted-foreground">
          The people who would matter to you are already in this room.
          Placeholder shell — the intake flow lands here.
        </p>
      </div>

      <Button asChild className="w-full">
        <Link href="/design">Design system</Link>
      </Button>
    </main>
  );
}
