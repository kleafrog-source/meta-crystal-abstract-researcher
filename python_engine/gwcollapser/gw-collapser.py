#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gwcollapser.torus_flow import (
    analyze_torus_flow,
    get_texts,
    print_detailed_report,
    visualize_torus_flow_matplotlib,
)


if __name__ == "__main__":
    docs, query = get_texts(n_docs=40)
    print("Получение эмбеддингов через Ollama...")
    result = analyze_torus_flow(docs, query, n_clusters=5, dt=0.02, friction=0.01)
    visualize_torus_flow_matplotlib(result)
    print_detailed_report(result)
