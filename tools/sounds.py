"""Synthesizes the mod's sound effects into sounds/*.wav (22 kHz mono, 16-bit).

    python3 tools/sounds.py
"""
import math
import random
import struct
import wave

RATE = 22050
random.seed(7)


def save(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    with wave.open(f"sounds/{name}.wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s / peak * 0.85)) * 32767)) for s in samples))


def env(i, n, attack=0.02, release=0.3):
    t = i / n
    a = min(1, t / attack) if attack > 0 else 1
    r = min(1, (1 - t) / release) if release > 0 else 1
    return a * r


def noise():
    return random.uniform(-1, 1)


def charge(sec=2.4):
    n = int(RATE * sec)
    out, phase, lp = [], 0.0, 0.0
    for i in range(n):
        t = i / n
        f = 70 + 260 * t * t
        phase += 2 * math.pi * f / RATE
        lp += (noise() - lp) * (0.05 + 0.3 * t)
        out.append((math.sin(phase) * 0.6 + math.sin(phase * 2.01) * 0.25 + lp * 0.5 * t) * env(i, n, 0.2, 0.05))
    return out


def fire(sec=0.9):
    n = int(RATE * sec)
    out, lp, phase = [], 0.0, 0.0
    for i in range(n):
        t = i / n
        lp += (noise() - lp) * (0.6 - 0.5 * t)
        phase += 2 * math.pi * (220 - 160 * t) / RATE
        out.append((lp * 0.9 + math.sin(phase) * 0.5) * env(i, n, 0.005, 0.7))
    return out


def hit(sec=0.35):
    n = int(RATE * sec)
    out, phase = [], 0.0
    for i in range(n):
        t = i / n
        phase += 2 * math.pi * (140 * (1 - t) + 40) / RATE
        out.append((math.sin(phase) + noise() * (1 - t) * 0.6) * env(i, n, 0.002, 0.9))
    return out


def boom(sec=1.8):
    n = int(RATE * sec)
    out, lp, lp2 = [], 0.0, 0.0
    for i in range(n):
        t = i / n
        lp += (noise() - lp) * (0.25 * (1 - t) + 0.02)
        lp2 += (lp - lp2) * 0.08
        out.append((lp * 0.6 + lp2 * 2.2) * (1 - t) ** 1.5 * env(i, n, 0.003, 0.2))
    return out


def heal(sec=1.2):
    notes = [523.25, 659.25, 783.99, 1046.5]
    n = int(RATE * sec)
    out = [0.0] * n
    for k, f in enumerate(notes):
        start = int(k * RATE * 0.12)
        for i in range(start, n):
            t = (i - start) / RATE
            out[i] += math.sin(2 * math.pi * f * t) * math.exp(-t * 3.5) * 0.4
    return out


def scouter(sec=0.9):
    n = int(RATE * sec)
    out = []
    for i in range(n):
        t = i / RATE
        on = (t % 0.15) < 0.08
        out.append(math.copysign(1, math.sin(2 * math.pi * 1800 * t)) * 0.4 * on * env(i, n, 0.0, 0.1))
    return out


for name, make in [("charge", charge), ("fire", fire), ("hit", hit), ("boom", boom), ("heal", heal), ("scouter", scouter)]:
    save(name, make())
    print("sounds/" + name + ".wav")
