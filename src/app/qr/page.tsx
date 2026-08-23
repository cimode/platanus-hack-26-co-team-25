import type { Metadata } from "next";
import { headers } from "next/headers";
import { intakePath } from "@/app/intake/guards";
import { QrCode } from "@/components/qr/qr-code";
import { serverDeps } from "@/lib/composition";

export const metadata: Metadata = { title: "dipia · QR" };

/**
 * `/qr` -- the code the host holds up, person after person.
 *
 * It encodes the room's intake link (`intakePath`, the same one step 2 reads
 * `?room=` from) as an absolute URL, so a phone that scans it lands on the
 * registration screen with the room already chosen. Asking someone to scan is
 * faster than spelling a URL, and keeps the host's own phone out of the form.
 *
 * A Server Component: it resolves the room exactly as `/intake` does -- `?room=`
 * first, then `HOOKAI_ROOM_SLUG` -- so the code can only ever point at a room
 * that exists. The origin comes from the request, not from configuration:
 * whatever host served this page is the host the scanners should reach.
 *
 * The site gate, when it is on, still stands in front of the scanned link; the
 * gate carries the target through `?next=`, so the password is the only thing
 * the host has to tell people.
 */
export default async function QrPage(props: PageProps<"/qr">) {
  const searchParams = await props.searchParams;
  const slug = firstValue(searchParams.room) ?? process.env.HOOKAI_ROOM_SLUG;
  const room = slug ? await serverDeps().rooms.bySlug(slug) : null;

  if (!room) return <MissingRoom slug={slug} />;

  const link = `${await requestOrigin()}${intakePath(room.slug)}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-7 pt-12 pb-10 text-center">
      <Wordmark />
      <h1 className="mt-8 font-display font-extrabold text-[28px] text-ink leading-tight">
        Escanea y entra
      </h1>
      <p className="mt-1 text-ink-muted text-sm">{room.name}</p>

      <div className="mt-6 w-full rounded-2xl bg-card p-4 shadow-toy">
        <QrCode value={link} label={`Código QR para entrar a ${room.name}`} />
      </div>

      <p className="mt-5 text-ink-soft text-sm">
        Abre la cámara del celular y apunta al código. Si no abre, escribe el
        enlace:
      </p>
      <p className="mt-2 break-all font-mono text-[12px] text-ink-muted">
        {link}
      </p>
    </main>
  );
}

function MissingRoom({ slug }: { slug: string | undefined }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-7 pt-12 pb-10 text-center">
      <Wordmark />
      <h1 className="mt-8 font-display font-extrabold text-[28px] text-ink leading-tight">
        No encontré esa sala
      </h1>
      <p className="mt-3 text-ink-muted text-sm">
        {slug ? (
          <>
            No existe ninguna sala con el slug{" "}
            <span className="font-mono text-ink">{slug}</span>.
          </>
        ) : (
          <>
            Abre <span className="font-mono text-ink">/qr?room=…</span> con el
            slug de una sala, o define{" "}
            <span className="font-mono text-ink">HOOKAI_ROOM_SLUG</span>.
          </>
        )}
      </p>
    </main>
  );
}

function Wordmark() {
  return (
    <p className="font-display font-extrabold text-[40px] text-ink leading-none lowercase tracking-tight">
      dipia<span className="text-primary">.</span>
    </p>
  );
}

/**
 * The scheme and host this request arrived on.
 *
 * Behind Vercel the function sees the platform's internal host; the public one
 * -- www.dipia.lat -- travels in `x-forwarded-host`, with the scheme in
 * `x-forwarded-proto`. Locally neither header exists and `host` is
 * `localhost:3000`, which is served over http.
 */
async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  const proto =
    requestHeaders.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

/** `?room=a&room=b` is a broken link, not a choice: take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
