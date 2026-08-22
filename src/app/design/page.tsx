import { Briefcase, Handshake, Heart } from "lucide-react";
import type { Metadata } from "next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "hookai · design system",
  description: "Token and component reference for the hookai design system.",
};

/* -------------------------------------------------------------------------- */
/*  Shared data                                                               */
/* -------------------------------------------------------------------------- */

const LENSES = [
  {
    key: "romantic",
    label: "Romantic",
    cls: "lens-romantic",
    hue: "rose",
    Icon: Heart,
    blurb: "romantic compatibility",
  },
  {
    key: "business",
    label: "Business",
    cls: "lens-business",
    hue: "violet",
    Icon: Briefcase,
    blurb: "partnership / cofounder fit",
  },
  {
    key: "friendship",
    label: "Friendship",
    cls: "lens-friendship",
    hue: "amber",
    Icon: Handshake,
    blurb: "friendship compatibility",
  },
] as const;

const SURFACES = [
  ["background", "--background"],
  ["card", "--card"],
  ["muted", "--muted"],
  ["secondary", "--secondary"],
  ["border", "--border"],
  ["foreground", "--foreground"],
] as const;

const RADII = [
  ["sm", "rounded-sm"],
  ["md", "rounded-md"],
  ["lg", "rounded-lg"],
  ["xl", "rounded-xl"],
  ["2xl", "rounded-2xl"],
] as const;

const TIMELINE = [
  { year: "02", event: "You move to Manhattan", o: "0.82", c: "0.44" },
  { year: "04", event: "The apartment on Fifth Avenue", o: "0.79", c: "0.51" },
  { year: "06", event: "The kid", o: "0.88", c: "0.62" },
] as const;

const RANKING = [
  { name: "Ana R.", initials: "AR", score: 92 },
  { name: "Luis M.", initials: "LM", score: 87 },
  { name: "Sofía G.", initials: "SG", score: 81 },
] as const;

/* -------------------------------------------------------------------------- */
/*  Primitives local to this page                                             */
/* -------------------------------------------------------------------------- */

function Section({
  n,
  title,
  note,
  children,
}: {
  n: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-8 space-y-5" id={title.toLowerCase()}>
      <div className="space-y-1">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-brand">{n}</span>
          <h2 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            {title}
          </h2>
        </div>
        {note ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{note}</p>
        ) : null}
      </div>
      {children}
      <Separator />
    </section>
  );
}

function Swatch({
  name,
  varName,
  ring,
}: {
  name: string;
  varName: string;
  ring?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "h-16 rounded-lg border",
          ring ? "border-border" : "border-border/40"
        )}
        style={{ background: `var(${varName})` }}
      />
      <div className="space-y-0.5 font-mono text-[0.7rem] leading-tight">
        <div className="text-foreground">{name}</div>
        <div className="text-muted-foreground">{varName}</div>
      </div>
    </div>
  );
}

/** Label for a spec being demonstrated, in the engine's mono voice. */
function Spec({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[0.7rem] tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  In-situ samples -- the real proof the system works                        */
/* -------------------------------------------------------------------------- */

function RankingSample({ active }: { active: boolean }) {
  return (
    <div className="space-y-2">
      {RANKING.map((p, i) => (
        <div
          key={p.name}
          className={cn(
            "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all",
            active && i === 0 && "glow"
          )}
        >
          <Avatar className="size-9">
            <AvatarFallback className="font-mono text-xs">
              {p.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{p.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {p.score}%
              </span>
            </div>
            <Progress value={p.score} className="h-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineSample() {
  return (
    <ol className="space-y-6">
      {TIMELINE.map((e) => (
        <li key={e.year} className="grid grid-cols-[3.5rem_1fr] gap-4">
          <div className="pt-1.5 font-mono text-xs text-muted-foreground">
            YEAR
            <br />
            <span className="text-primary">{e.year}</span>
          </div>
          <div className="space-y-2 border-l border-border pl-4">
            <p className="font-narrative text-2xl leading-tight text-balance">
              {e.event}
            </p>
            <div className="flex gap-3 font-mono text-[0.7rem] text-muted-foreground">
              <span>O {e.o}</span>
              <span>C {e.c}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function DesignSystemPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14">
      {/* -- masthead ------------------------------------------------------- */}
      <header className="space-y-4 pb-12">
        <div className="flex items-center gap-2.5">
          <span className="size-2 rounded-full bg-brand" />
          <span className="text-xl font-semibold tracking-tight lowercase">
            hookai
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="font-narrative text-5xl leading-[1.05] text-balance sm:text-6xl">
            A simulation engine for human relationships.
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Design system reference. Every screen in hookai is built from these
            tokens — nothing here is decoration, and nothing outside here is
            allowed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="outline" className="font-mono text-[0.7rem]">
            dark-only
          </Badge>
          <Badge variant="outline" className="font-mono text-[0.7rem]">
            radius 1rem
          </Badge>
          <Badge variant="outline" className="font-mono text-[0.7rem]">
            Instrument Serif · Geist · Geist Mono
          </Badge>
        </div>
      </header>

      <div className="space-y-12">
        {/* -- 01 brand ---------------------------------------------------- */}
        <Section
          n="01"
          title="Brand"
          note="The wordmark is always lowercase, one word, tight tracking. It is the logo — there is no separate mark. Cyan is hookai's own colour and appears only on the engine's surfaces: intake, loading, the shell. It never competes with a lens."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex h-28 items-center justify-center">
                <span className="text-2xl font-semibold tracking-tight lowercase">
                  hookai
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex h-28 items-center justify-center gap-2">
                <span className="size-2 rounded-full bg-brand" />
                <span className="text-2xl font-semibold tracking-tight lowercase">
                  hookai
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex h-28 items-center justify-center">
                <span className="text-sm font-medium tracking-tight lowercase">
                  hookai{" "}
                  <span className="text-muted-foreground">· romantic</span>
                </span>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Swatch name="brand" varName="--brand" ring />
            <Swatch name="brand-foreground" varName="--brand-foreground" ring />
          </div>
        </Section>

        {/* -- 02 typography ------------------------------------------------ */}
        <Section
          n="02"
          title="Typography"
          note="Three voices, three jobs. The serif narrates a life. The sans runs the interface. The mono is the engine reporting — scores, years, dimensions, IDs. Never swap their roles: that separation is what makes the product read as an engine telling a story rather than a chatbot with opinions. font-heading is Geist, not the serif — card and dialog titles are furniture, so the serif stays rare enough to still mean something."
        >
          <div className="space-y-8">
            <div className="space-y-2">
              <Spec>font-narrative · Instrument Serif 400 · narrative</Spec>
              <p className="font-narrative text-4xl leading-tight text-balance">
                Year six: the kid.
              </p>
              <p className="font-narrative text-2xl leading-snug text-muted-foreground">
                You buy the apartment on Fifth Avenue.
              </p>
            </div>
            <Separator />
            <div className="space-y-2">
              <Spec>font-sans / font-heading · Geist · interface</Spec>
              <p className="text-base">
                Pick someone from the ranking to simulate a shared life.
              </p>
              <p className="text-sm text-muted-foreground">
                Supporting copy, form labels, descriptions, navigation.
              </p>
            </div>
            <Separator />
            <div className="space-y-2">
              <Spec>font-mono · Geist Mono · engine output</Spec>
              <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm">
                <span>92% MATCH</span>
                <span className="text-muted-foreground">O 0.82</span>
                <span className="text-muted-foreground">C 0.44</span>
                <span className="text-muted-foreground">E 0.71</span>
                <span className="text-muted-foreground">YEAR 06</span>
              </div>
            </div>
          </div>
        </Section>

        {/* -- 03 surfaces -------------------------------------------------- */}
        <Section
          n="03"
          title="Surfaces"
          note="A pure neutral base, deliberately colourless. All colour in the product is meaningful: cyan means hookai, an accent means a lens. If a surface needs a colour, it is wrong."
        >
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {SURFACES.map(([name, v]) => (
              <Swatch key={v} name={name} varName={v} ring />
            ))}
          </div>
        </Section>

        {/* -- 04 lenses ---------------------------------------------------- */}
        <Section
          n="04"
          title="Lenses"
          note="Put lens-romantic, lens-business or lens-friendship on any subtree and every token inside retakes its temperature. No variant props, no conditional classNames, no per-lens components. The same ranking card below is rendered three times with one class changed."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {LENSES.map(({ key, label, cls, hue, Icon, blurb }) => (
              <div key={key} className={cn(cls, "space-y-4")}>
                <Card className="gap-4">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-primary" />
                      <CardTitle className="text-sm">{label}</CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                      {blurb}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <Swatch name={hue} varName="--primary" />
                      <Swatch name="accent" varName="--accent" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm">Simulate</Button>
                      <Button size="sm" variant="outline">
                        Skip
                      </Button>
                    </div>
                    <RankingSample active />
                  </CardContent>
                </Card>
                <Spec>.{cls}</Spec>
              </div>
            ))}
          </div>
        </Section>

        {/* -- 05 shape & glow ---------------------------------------------- */}
        <Section
          n="05"
          title="Shape & glow"
          note="Radius 1rem, hairline borders, flat at rest. Glow is reserved for active, selected or focused surfaces and inherits the lens automatically — it reads from --primary. Everything at rest staying flat is what makes the glow mean something; ambient glow means nothing."
        >
          <div className="space-y-8">
            <div className="space-y-3">
              <Spec>radius scale · --radius: 1rem</Spec>
              <div className="flex flex-wrap gap-4">
                {RADII.map(([name, cls]) => (
                  <div key={name} className="space-y-2">
                    <div
                      className={cn(
                        "size-16 border border-border bg-card",
                        cls
                      )}
                    />
                    <Spec>{name}</Spec>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <Spec>state · resting vs active</Spec>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <div className="flex h-20 items-center justify-center rounded-xl border border-border bg-card text-xs text-muted-foreground">
                    resting
                  </div>
                  <Spec>border-border</Spec>
                </div>
                {LENSES.map(({ key, cls }) => (
                  <div key={key} className={cn(cls, "space-y-2")}>
                    <div className="flex h-20 items-center justify-center rounded-xl border glow bg-card text-xs">
                      active
                    </div>
                    <Spec>.glow in .{cls.replace("lens-", "")}</Spec>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <div className="flex h-20 items-center justify-center rounded-xl border glow-brand bg-card text-xs">
                    pre-lens
                  </div>
                  <Spec>.glow-brand</Spec>
                </div>
                <div className="space-y-2">
                  <div className="flex h-20 items-center justify-center rounded-xl border border-border bg-card text-xs text-muted-foreground glow-sm">
                    subtle
                  </div>
                  <Spec>.glow-sm</Spec>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* -- 06 controls -------------------------------------------------- */}
        <Section
          n="06"
          title="Controls"
          note="Intake is the only pre-lens screen, so it runs on brand cyan. Buttons, fields and inputs shown at the sizes actually used on a phone."
        >
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-sm">Buttons</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button>Default</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="xs">xs</Button>
                  <Button size="sm">sm</Button>
                  <Button size="default">default</Button>
                  <Button size="lg">lg</Button>
                  <Button disabled>disabled</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Intake fields</CardTitle>
                <CardDescription className="text-xs">
                  pre-lens · brand cyan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="ds-name">Name</FieldLabel>
                    <Input id="ds-name" placeholder="Ana Ramírez" />
                    <FieldDescription>
                      Shown to others in the room.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ds-bio">
                      Describe yourself in a sentence
                    </FieldLabel>
                    <Textarea
                      id="ds-bio"
                      rows={3}
                      placeholder="I build things at 3am and regret it at 9."
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ds-open">Openness</FieldLabel>
                    <Slider
                      id="ds-open"
                      defaultValue={[72]}
                      max={100}
                      step={1}
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox id="ds-consent" defaultChecked />
                    <FieldLabel htmlFor="ds-consent" className="text-sm">
                      Include me in romantic rankings
                    </FieldLabel>
                  </Field>
                  <Button className="w-full glow-brand">Continue</Button>
                </FieldGroup>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* -- 07 in situ --------------------------------------------------- */}
        <Section
          n="07"
          title="In situ"
          note="The system doing its actual job. Left: the room ranked under one lens — mono for the engine's numbers, sans for identity. Right: the timeline — serif carries the life, mono carries the evidence underneath it. This is the pairing the whole type system exists for."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="lens-romantic space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Heart className="size-4 text-primary" />
                    <CardTitle className="text-sm">The room, ranked</CardTitle>
                  </div>
                  <CardDescription className="font-mono text-[0.7rem]">
                    24 people · romantic lens
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RankingSample active />
                </CardContent>
              </Card>
            </div>

            <div className="lens-romantic space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    A shared life with Ana R.
                  </CardTitle>
                  <CardDescription className="font-mono text-[0.7rem]">
                    92% match · 3 canonical events
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TimelineSample />
                </CardContent>
              </Card>
            </div>
          </div>
        </Section>

        {/* -- 08 loading --------------------------------------------------- */}
        <Section
          n="08"
          title="Loading"
          note="Generation takes real seconds, so loading is a designed state, not an afterthought. Skeletons mirror the shape of what is coming — a timeline entry, not a grey rectangle."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-4">
                  <Skeleton className="h-8 w-10" />
                  <div className="space-y-2 border-l border-border pl-4">
                    <Skeleton className="h-6 w-4/5" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center rounded-xl border border-border bg-card p-4">
              <div className="w-full space-y-3 rounded-xl border glow-brand p-4">
                <Spec>simulating · pre-lens</Spec>
                <Progress value={64} className="h-1" />
                <p className="font-mono text-[0.7rem] text-muted-foreground">
                  building canonical events · 64%
                </p>
              </div>
            </div>
          </div>
        </Section>
      </div>

      <footer className="pt-6">
        <p className="font-mono text-[0.7rem] text-muted-foreground">
          hookai · design reference · tokens live in{" "}
          <span className="text-foreground">src/app/globals.css</span>
        </p>
      </footer>
    </main>
  );
}
