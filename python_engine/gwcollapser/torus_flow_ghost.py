#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import io
import json
import sys
from pathlib import Path

import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from gwcollapser.torus_flow import FlowSource, TorusFlowField, TorusGeometry
else:
    from .torus_flow import FlowSource, TorusFlowField, TorusGeometry

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def detect_oscillation(history, window_size: int = 5, speed_threshold: float = 1e-3):
    points = np.asarray(history, dtype=float)
    if points.ndim != 2 or len(points) <= max(2, window_size):
        return None

    speeds = []
    for index in range(1, len(points)):
        prev = points[index - 1]
        curr = points[index]
        dx = (curr[0] - prev[0] + np.pi) % (2 * np.pi) - np.pi
        dy = (curr[1] - prev[1] + np.pi) % (2 * np.pi) - np.pi
        speeds.append(float(np.sqrt(dx * dx + dy * dy)))

    for index in range(window_size, len(speeds) + 1):
        avg_speed = float(np.mean(speeds[index - window_size:index]))
        if avg_speed < speed_threshold:
            return index
    return None


def continue_trajectory(
    *,
    start_xy,
    sources,
    geometry_R: float = 1.2,
    geometry_r: float = 0.6,
    epsilon: float = 0.15,
    dt: float = 0.02,
    friction: float = 0.01,
    steps: int = 100,
    tol_speed: float = 1e-3,
):
    geometry = TorusGeometry(R=geometry_R, r=geometry_r)
    field = TorusFlowField(geometry, epsilon=epsilon)

    for source in sources:
        field.add_source(
            FlowSource(
                float(source.get("x", 0.0)),
                float(source.get("y", 0.0)),
                mass=float(source.get("mass", 1.0)),
                spin=float(source.get("spin", 1.0)),
            )
        )

    x = float(start_xy[0]) % (2 * np.pi)
    y = float(start_xy[1]) % (2 * np.pi)
    history = [(x, y)]
    speeds = []

    for step in range(max(1, int(steps))):
        vx, vy = field.velocity(x, y)
        vx *= 1.0 - float(friction)
        vy *= 1.0 - float(friction)
        speed = float(np.sqrt(vx * vx + vy * vy))
        speeds.append(speed)
        x = (x + vx * float(dt)) % (2 * np.pi)
        y = (y + vy * float(dt)) % (2 * np.pi)
        history.append((x, y))
        if speed < float(tol_speed) and step > 10:
            break

    return {
        "history": np.asarray(history, dtype=float),
        "speeds": np.asarray(speeds, dtype=float),
        "final": np.asarray(history[-1], dtype=float),
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: torus_flow_ghost.py <input.json>")

    input_path = Path(sys.argv[1])
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    analysis = payload.get("analysis") or {}
    flow = analysis.get("flow") or {}
    torus = analysis.get("torus") or {}
    parameters = analysis.get("parameters") or {}
    docs = analysis.get("docs") or []
    history = flow.get("history") or []
    start_frame = max(0, int(payload.get("start_frame", 0)))
    steps = max(1, int(payload.get("steps", 100)))

    if not history:
        raise ValueError("ghost continue requires analysis.flow.history")

    base_history = history[: start_frame + 1] if start_frame < len(history) else history
    start_xy = base_history[-1]
    sources = [
        {
            "x": float((doc.get("torus") or {}).get("x", 0.0)),
            "y": float((doc.get("torus") or {}).get("y", 0.0)),
            "mass": 1.0,
            "spin": 1.0 if index % 2 == 0 else -1.0,
        }
        for index, doc in enumerate(docs)
    ]
    oscillation_frame = detect_oscillation(
        history,
        window_size=5,
        speed_threshold=float(parameters.get("tol_speed", 1e-3)),
    )
    ghost = continue_trajectory(
        start_xy=start_xy,
        sources=sources,
        geometry_R=float(torus.get("R", parameters.get("geometry_R", 1.2))),
        geometry_r=float(torus.get("r", parameters.get("geometry_r", 0.6))),
        epsilon=float(torus.get("epsilon", parameters.get("epsilon", 0.15))),
        dt=float(parameters.get("dt", 0.02)),
        friction=float(parameters.get("friction", 0.01)),
        steps=steps,
        tol_speed=float(parameters.get("tol_speed", 1e-3)),
    )
    result = {
        "crystal_id": payload.get("crystal_id"),
        "crystal_code": payload.get("crystal_code"),
        "start_frame": start_frame,
        "steps": steps,
        "oscillation_frame": oscillation_frame,
        "base_history": base_history,
        "ghost_history": np.asarray(ghost["history"]).tolist(),
        "final_point": np.asarray(ghost["final"]).tolist(),
        "parameters": {
            "dt": float(parameters.get("dt", 0.02)),
            "friction": float(parameters.get("friction", 0.01)),
            "epsilon": float(torus.get("epsilon", parameters.get("epsilon", 0.15))),
            "geometry_R": float(torus.get("R", parameters.get("geometry_R", 1.2))),
            "geometry_r": float(torus.get("r", parameters.get("geometry_r", 0.6))),
            "max_steps": int(parameters.get("max_steps", 1500)),
            "tol_speed": float(parameters.get("tol_speed", 1e-3)),
            "n_clusters": int(torus.get("clusters", parameters.get("n_clusters", 1))),
            "embedding_model": parameters.get("embedding_model"),
        },
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
