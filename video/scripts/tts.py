"""Voice a lesson with edge-tts, keeping word timestamps for the captions.
Usage:  python -I scripts/tts.py lessons/<id>.json
Output: public/audio/<id>/*.mp3 and src/data/<id>.json"""
import asyncio, json, os, subprocess, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUNCT = "„“\"'!?.,:;()…–-"


def core(tok):
    return tok.strip(PUNCT).lower().replace("-", "")


async def synth(text, voice, path, rate):
    for attempt in range(4):
        try:
            words = []
            c = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
            with open(path, "wb") as f:
                async for ch in c.stream():
                    if ch["type"] == "audio":
                        f.write(ch["data"])
                    elif ch["type"] == "WordBoundary":
                        words.append({"t": ch["text"], "s": ch["offset"] / 1e7, "e": (ch["offset"] + ch["duration"]) / 1e7})
            dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))
            return dur, words
        except Exception as e:  # edge-tts occasionally returns no audio: retry
            print("  retry", attempt + 1, type(e).__name__, e, file=sys.stderr)
            await asyncio.sleep(3)
    raise RuntimeError(f"TTS fehlgeschlagen: {text[:40]}")


def align(text, words):
    """Map the word timestamps onto the tokens of the text (for karaoke-style captions)."""
    toks, j = [], 0
    for tok in text.split():
        c = core(tok)
        s = e = None
        if c and j < len(words):
            acc, k = "", j
            while k < len(words) and len(acc) < len(c):
                acc += core(words[k]["t"])
                k += 1
                if acc == c:
                    s, e, j = words[j]["s"], words[k - 1]["e"], k
                    break
        if s is None:
            s = toks[-1]["e"] if toks else 0
            e = s
        toks.append({"t": tok, "s": round(s, 3), "e": round(e, 3)})
    return toks


async def main(path):
    L = json.load(open(path, encoding="utf-8"))
    lid, voice, rate = L["id"], L["voice"], L.get("rate", "+0%")
    adir = os.path.join(ROOT, "public/audio", lid)
    os.makedirs(adir, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "src/data"), exist_ok=True)
    cache_path = os.path.join(adir, "cache.json")
    cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}

    for si, sc in enumerate(L["scenes"]):
        for pi, p in enumerate(sc["parts"]):
            name = f"s{si}p{pi}"
            mp3 = os.path.join(adir, name + ".mp3")
            c = cache.get(name)
            if c and c["text"] == p["say"] and c["voice"] == voice and c.get("rate", "+0%") == rate and os.path.exists(mp3):
                dur, words = c["dur"], c["words"]
            else:
                dur, words = await synth(p["say"], voice, mp3, rate)
                cache[name] = {"text": p["say"], "voice": voice, "rate": rate, "dur": dur, "words": words}
                json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"{name:8s} {dur:6.2f}s  {len(words)} Wörter")
            p["audio"] = {"src": f"audio/{lid}/{name}.mp3", "duration": round(dur, 3), "tokens": align(p["say"], words)}

    json.dump(L, open(os.path.join(ROOT, "src/data", lid + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


asyncio.run(main(sys.argv[1]))
