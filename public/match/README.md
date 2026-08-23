# `/match` demo pair

The match reveal (`/match`, CONTEXT.md §3 step 6) pairs two participants and
generates the face of their imagined child with an image model.

The two faces come from committed files here:

| File | Circle | Alias (`src/app/match/demo-pair.ts`) |
| --- | --- | --- |
| `parent-a.jpg` | top-left | Oso Dormilón |
| `parent-b.jpg` | top-right | Zorro Curioso |

`baby-placeholder.jpg` is what the **fake** studio returns when `OPENAI_API_KEY`
is absent (local without a key, and every e2e run) — so `/match` always renders
a third circle. With a key set, the child is generated live and this file is
unused.

## Use real photos

Replace the two files in place — same names, same paths — with real face photos
(JPEG, roughly square, a clear front-facing face). Nothing else changes; the
aliases live in `src/app/match/demo-pair.ts` if you want to rename them.

```bash
cp /path/to/first.jpg  public/match/parent-a.jpg
cp /path/to/second.jpg public/match/parent-b.jpg
```

The committed placeholders are model-generated stand-in faces, not real people.
