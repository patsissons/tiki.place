import { Suspense } from "react";
import { SubmitForm } from "@/components/submit-form";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Suggest a bar", description: "Suggest a missing tiki bar or correct a listing.", path: "/submit" });

export default function SubmitPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Suggest a bar</h1>
      <p className="mt-3 text-fg-muted">
        Know a tiki bar we are missing, or a listing that is wrong? Tell us. Submissions become observations in the same pipeline as every other source, get checked
        against Google, and are reviewed by a person before publishing.
      </p>
      <div className="mt-8">
        <Suspense>
          <SubmitForm siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        </Suspense>
      </div>
    </main>
  );
}
