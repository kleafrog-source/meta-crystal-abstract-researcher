#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import hashlib
import warnings

import numpy as np
import requests
from sklearn.cluster import KMeans
from sklearn.preprocessing import normalize

warnings.filterwarnings("ignore")


def get_ollama_embedding(text: str, model: str = "qllama/bge-m3:q8_0") -> np.ndarray:
    """Получить эмбеддинг из локального Ollama."""
    url = "http://localhost:11434/api/embeddings"
    payload = {"model": model, "prompt": text}
    response = requests.post(url, json=payload, timeout=60)
    if response.status_code != 200:
        raise RuntimeError(f"Ollama error: {response.status_code} {response.text}")
    data = response.json()
    emb = np.array(data.get("embedding"))
    if emb.ndim != 1:
        raise ValueError("Unexpected embedding shape from Ollama")
    return emb


def get_embeddings_ollama(docs, query, model="qllama/bge-m3:q8_0"):
    doc_emb = np.array([get_ollama_embedding(doc, model) for doc in docs], dtype=float)
    query_emb = get_ollama_embedding(query, model)
    doc_emb = normalize(doc_emb, norm="l2")
    query_emb = normalize(query_emb.reshape(1, -1), norm="l2").reshape(-1)
    return doc_emb, query_emb


def generate_40_sentences():
    topics = {
        "physics": [
            "Законы Ньютона описывают движение тел",
            "Квантовая механика использует волновую функцию",
            "Теория относительности связывает пространство и время",
            "Энтропия — мера беспорядка в системе",
            "Гравитация искривляет пространство-время",
            "Фотоны не имеют массы покоя",
            "Квантовая запутанность нарушает локальность",
            "Тёмная энергия ускоряет расширение Вселенной",
        ],
        "philosophy": [
            "Бытие определяет сознание, утверждал Маркс",
            "Экзистенциализм подчёркивает свободу выбора",
            "Платон считал мир идей первичным",
            "Воля к власти — движущая сила у Ницше",
            "Кант анализировал границы познания",
            "Декарт сказал: 'Я мыслю, следовательно существую'",
            "Гегель разработал диалектику",
            "Феноменология изучает структуры сознания",
        ],
        "culinary": [
            "Паста аль денте требует точного времени варки",
            "Трюфель придаёт блюдам изысканный аромат",
            "Су-вид сохраняет сочность и текстуру",
            "Шоколадный ганаш готовится из сливок и шоколада",
            "Карбонара — паста с яйцом и беконом",
            "Том-ям — острый суп с креветками",
            "Суши — рис с рыбой и водорослями",
            "Стейк рибай готовят на гриле",
        ],
        "sport": [
            "Марафон — дистанция 42 километра",
            "Баскетбол требует командной игры",
            "Плавание развивает все группы мышц",
            "Йога улучшает гибкость и баланс",
            "Теннис требует быстрой реакции",
            "Футбол — самая популярная игра в мире",
            "Бокс развивает силу и рефлексы",
            "Шахматы тренируют стратегию",
        ],
        "art": [
            "Импрессионизм передаёт игру света",
            "Бетховен написал девять симфоний",
            "Дали создавал сюрреалистические образы",
            "Архитектура сочетает красоту и функцию",
            "Мона Лиза — шедевр Леонардо",
            "Готика устремлена в небо",
            "Рембрандт играл светотенью",
            "Ван Гог создал 'Звёздную ночь'",
        ],
    }
    sentences = []
    for _, lst in topics.items():
        sentences.extend(lst)
    return sentences


def get_texts(n_docs=40):
    if n_docs != 40:
        raise ValueError("В этой версии демо поддерживается только n_docs=40")
    docs = generate_40_sentences()
    query = (
        "Как квантовая гравитация и теория относительности "
        "объясняют структуру пространства-времени?"
    )
    return docs, query


class TorusGeometry:
    """Чистая геометрия T² -> R³, без физики."""

    def __init__(self, R: float = 1.2, r: float = 0.6):
        self.R = R
        self.r = r

    def to_3d(self, x: float, y: float) -> np.ndarray:
        X = (self.R + self.r * np.cos(y)) * np.cos(x)
        Y = (self.R + self.r * np.cos(y)) * np.sin(x)
        Z = self.r * np.sin(y)
        return np.array([X, Y, Z])

    def grid(self, nu: int = 40, nv: int = 40):
        u = np.linspace(0, 2 * np.pi, nu)
        v = np.linspace(0, 2 * np.pi, nv)
        U, V = np.meshgrid(u, v)
        X = (self.R + self.r * np.cos(V)) * np.cos(U)
        Y = (self.R + self.r * np.cos(V)) * np.sin(U)
        Z = self.r * np.sin(V)
        return U, V, X, Y, Z


class FlowSource:
    """Источник потока на торе: документ или кластер."""

    def __init__(self, x: float, y: float, mass: float = 1.0, spin: float = 1.0):
        self.x = x % (2 * np.pi)
        self.y = y % (2 * np.pi)
        self.mass = float(mass)
        self.spin = float(spin)


class TorusFlowField:
    """Векторное поле на T² = суперпозиция вихрей от источников."""

    def __init__(self, geometry: TorusGeometry, epsilon: float = 0.15):
        self.geometry = geometry
        self.sources = []
        self.epsilon = float(epsilon)

    def add_source(self, source: FlowSource):
        self.sources.append(source)

    @staticmethod
    def _toroidal_delta(x1, y1, x2, y2):
        dx = (x1 - x2 + np.pi) % (2 * np.pi) - np.pi
        dy = (y1 - y2 + np.pi) % (2 * np.pi) - np.pi
        return dx, dy

    def velocity(self, x: float, y: float) -> tuple[float, float]:
        vx, vy = 0.0, 0.0
        for source in self.sources:
            dx, dy = self._toroidal_delta(x, y, source.x, source.y)
            r2 = dx * dx + dy * dy + self.epsilon ** 2
            r = np.sqrt(r2)

            radial_strength = source.mass / r2
            rx = -dx / r
            ry = -dy / r

            tangential_strength = 0.4 * source.spin / r
            tx = -ry
            ty = rx

            vx += radial_strength * rx + tangential_strength * tx
            vy += radial_strength * ry + tangential_strength * ty

        speed = np.sqrt(vx * vx + vy * vy)
        if speed > 0:
            scale = np.tanh(0.7 * speed) / (speed + 1e-9)
            vx *= scale
            vy *= scale
        return vx, vy


def embeddings_to_torus_coords(embeddings: np.ndarray, k: int = 2, random_state: int = 0):
    n_docs = embeddings.shape[0]
    kmeans = KMeans(n_clusters=k, random_state=random_state, n_init=10)
    labels = np.asarray(kmeans.fit_predict(embeddings), dtype=int)

    cluster_angles = np.linspace(0, 2 * np.pi, k, endpoint=False)
    x_coords = np.zeros(n_docs)
    y_coords = np.zeros(n_docs)

    for cluster in range(k):
        idx = np.where(labels == cluster)[0]
        if len(idx) == 0:
            continue
        center = kmeans.cluster_centers_[cluster]
        proj = embeddings[idx] @ center
        idx_sorted = idx[np.argsort(proj)]
        x_coords[idx_sorted] = cluster_angles[cluster]
        y_coords[idx_sorted] = np.linspace(0, 2 * np.pi, len(idx_sorted), endpoint=False)

    return np.stack([x_coords, y_coords], axis=1), labels, kmeans


def query_to_torus_coord(query_emb: np.ndarray, kmeans: KMeans, n_clusters: int) -> tuple[float, float]:
    centers = normalize(kmeans.cluster_centers_, norm="l2")
    q = normalize(query_emb.reshape(1, -1), norm="l2")
    sims = centers @ q.T
    cluster = int(np.argmax(sims))
    x = (2 * np.pi * cluster) / n_clusters
    sim = float(sims[cluster, 0])
    y = (sim + 1.0) / 2.0 * 2 * np.pi
    return x % (2 * np.pi), y % (2 * np.pi)


def trace_flow(
    field: TorusFlowField,
    x0: float,
    y0: float,
    dt: float = 0.02,
    max_steps: int = 1500,
    tol_speed: float = 1e-3,
    friction: float = 0.01,
):
    x, y = float(x0), float(y0)
    history = [(x, y)]
    speeds = []

    for step in range(max_steps):
        vx, vy = field.velocity(x, y)
        vx *= 1.0 - friction
        vy *= 1.0 - friction

        speed = np.sqrt(vx * vx + vy * vy)
        speeds.append(speed)
        if speed < tol_speed and step > 10:
            break
        x = (x + vx * dt) % (2 * np.pi)
        y = (y + vy * dt) % (2 * np.pi)
        history.append((x, y))

    return {
        "history": np.array(history),
        "speeds": np.array(speeds),
        "final": np.array(history[-1]),
    }


def torus_laplacian_spectrum_placeholder(m_max: int = 3, n_max: int = 3):
    modes = []
    for m in range(-m_max, m_max + 1):
        for n in range(-n_max, n_max + 1):
            if m == 0 and n == 0:
                continue
            modes.append(((m, n), m * m + n * n))
    modes.sort(key=lambda item: item[1])
    return modes


class HFieldAdapter:
    """Каркас под ℋ: вместо KMeans+layout потом может жить MMSS-гиперсеть."""

    def __init__(self, n_clusters: int = 5):
        self.n_clusters = n_clusters
        self.kmeans = None

    def build_layout(self, doc_emb: np.ndarray):
        coords, labels, kmeans = embeddings_to_torus_coords(
            doc_emb,
            k=self.n_clusters,
            random_state=0,
        )
        self.kmeans = kmeans
        return coords, labels

    def project_query(self, query_emb: np.ndarray) -> tuple[float, float]:
        if self.kmeans is None:
            raise RuntimeError("Layout not built: call build_layout() first")
        return query_to_torus_coord(query_emb, self.kmeans, self.n_clusters)


class MMSSMetrics:
    """Слой MMSS-метрик поверх траектории и поля."""

    def __init__(self, docs, doc_emb: np.ndarray, doc_coords: np.ndarray, labels: np.ndarray, traj: dict, query_text: str):
        self.docs = docs
        self.doc_emb = doc_emb
        self.doc_coords = doc_coords
        self.labels = labels
        self.traj = traj
        self.query_text = query_text

    @staticmethod
    def _toroidal_distance(p1, p2):
        dx = (p1[0] - p2[0] + np.pi) % (2 * np.pi) - np.pi
        dy = (p1[1] - p2[1] + np.pi) % (2 * np.pi) - np.pi
        return np.sqrt(dx * dx + dy * dy)

    def compute_V(self):
        hist = self.traj["history"]
        path_length = 0.0
        for i in range(1, len(hist)):
            path_length += self._toroidal_distance(hist[i], hist[i - 1])
        V = float(np.tanh(path_length / (4 * np.pi + 1e-6)))
        return V, path_length

    def compute_S(self):
        speeds = self.traj["speeds"]
        if len(speeds) == 0:
            return 0.0, 0.0, 0.0
        mean_v = float(np.mean(speeds))
        std_v = float(np.std(speeds))
        variability = std_v / (mean_v + 1e-6)
        return float(1.0 / (1.0 + variability)), mean_v, std_v

    def compute_N(self):
        hist = self.traj["history"]
        if len(hist) < 3:
            return 0.0
        angles = []
        for i in range(1, len(hist) - 1):
            v1 = hist[i] - hist[i - 1]
            v2 = hist[i + 1] - hist[i]
            n1 = np.linalg.norm(v1)
            n2 = np.linalg.norm(v2)
            if n1 == 0 or n2 == 0:
                continue
            cos_a = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
            angles.append(np.arccos(cos_a))
        if not angles:
            return 0.0
        return float(np.tanh(float(np.mean(np.abs(np.array(angles, dtype=float)))) / np.pi))

    def compute_Df(self):
        hist = self.traj["history"]
        if len(hist) < 10:
            return 0.0
        epsilons = [np.pi / 2, np.pi / 4, np.pi / 8]
        cover_counts = []
        for eps in epsilons:
            covered = set()
            for x, y in hist:
                covered.add((int(x // eps), int(y // eps)))
            cover_counts.append(len(covered))
        cover_counts = np.array(cover_counts, dtype=float)
        if np.all(cover_counts == cover_counts[0]):
            return 0.0
        logN = np.log(cover_counts + 1e-6)
        logE = np.log(1.0 / np.array(epsilons))
        coef, _, _, _ = np.linalg.lstsq(np.vstack([logE, np.ones_like(logE)]).T, logN, rcond=None)
        return float(np.clip(coef[0] / 2.0, 0.0, 1.0))

    def compute_QEC(self):
        top5 = compute_topk_attractor_docs(self.doc_coords, self.traj["final"], top_k=5)
        dists = [dist for dist, _ in compute_topk_attractor_docs(self.doc_coords, self.traj["final"], top_k=len(self.doc_coords))]
        mean_all = float(np.mean(dists)) if dists else 0.0
        mean_top5 = float(np.mean([dist for dist, _ in top5])) if top5 else 0.0
        geom_part = 1.0 if mean_all == 0 else np.exp(-mean_top5 / (mean_all + 1e-6))

        top_idx = [idx for _, idx in top5]
        top_vecs = self.doc_emb[top_idx]
        centroid = np.mean(top_vecs, axis=0, keepdims=True)
        centroid = centroid / (np.linalg.norm(centroid) + 1e-9)
        sims = (top_vecs @ centroid.T).flatten()
        sim_part = (float(np.mean(sims)) + 1.0) / 2.0 if len(sims) else 0.0
        return float(0.5 * geom_part + 0.5 * sim_part), top5

    def compute_CHSH(self):
        phys_tokens = ["квант", "гравита", "фотон", "энерг", "пространство", "время", "механик", "относительн"]
        cluster_scores = {}
        for idx, text in enumerate(self.docs):
            score = sum(1 for token in phys_tokens if token in text.lower())
            cluster = int(self.labels[idx])
            cluster_scores[cluster] = cluster_scores.get(cluster, 0) + score
        if not cluster_scores:
            return 0.0, None
        phys_cluster = max(cluster_scores.items(), key=lambda item: item[1])[0]

        final_xy = self.traj["final"]
        d_phys = []
        d_non = []
        for i, (x, y) in enumerate(self.doc_coords):
            dx = (x - final_xy[0] + np.pi) % (2 * np.pi) - np.pi
            dy = (y - final_xy[1] + np.pi) % (2 * np.pi) - np.pi
            dist = np.sqrt(dx * dx + dy * dy)
            if int(self.labels[i]) == phys_cluster:
                d_phys.append(dist)
            else:
                d_non.append(dist)
        if not d_phys or not d_non:
            return 0.0, phys_cluster
        mean_phys = float(np.mean(d_phys))
        mean_non = float(np.mean(d_non))
        ratio = mean_phys / (mean_non + 1e-9)
        return float(np.clip(1.0 - ratio, 0.0, 1.0)), phys_cluster

    def compute_Q(self):
        V, _ = self.compute_V()
        S, _, _ = self.compute_S()
        N = self.compute_N()
        D_f = self.compute_Df()
        QEC, _ = self.compute_QEC()
        CH, _ = self.compute_CHSH()
        base = 0.15 * V + 0.15 * S + 0.15 * D_f + 0.25 * QEC + 0.25 * CH
        return {
            "V": V,
            "S": S,
            "N": N,
            "D_f": D_f,
            "QEC": QEC,
            "CHSH": CH,
            "Q": float(np.clip(base - 0.2 * N, 0.0, 1.0)),
        }


def _normalize_query_embedding(query_emb: np.ndarray) -> np.ndarray:
    return normalize(query_emb.reshape(1, -1), norm="l2").reshape(-1)


def _coerce_embeddings(doc_emb, query_emb):
    doc_vectors = np.asarray(doc_emb, dtype=float)
    query_vector = np.asarray(query_emb, dtype=float).reshape(-1)
    if doc_vectors.ndim != 2:
        raise ValueError("doc_emb must be a 2D array")
    if query_vector.ndim != 1:
        raise ValueError("query_emb must be a 1D array")
    if doc_vectors.shape[1] != query_vector.shape[0]:
        raise ValueError("doc_emb/query_emb dimensions do not match")
    return normalize(doc_vectors, norm="l2"), _normalize_query_embedding(query_vector)


def _deterministic_spin(doc_text: str, index: int) -> float:
    digest = hashlib.sha1(f"{index}:{doc_text}".encode("utf-8")).digest()
    return 1.0 if digest[0] % 2 == 0 else -1.0


def build_flow_sources(doc_coords: np.ndarray, docs: list[str], mass: float = 1.0):
    sources = []
    for index, (x, y) in enumerate(doc_coords):
        sources.append(
            FlowSource(
                x,
                y,
                mass=mass,
                spin=_deterministic_spin(docs[index], index),
            )
        )
    return sources


def compute_topk_attractor_docs(doc_coords: np.ndarray, final_xy: np.ndarray, top_k: int = 10):
    dists = []
    for i, (x, y) in enumerate(doc_coords):
        dx = (x - final_xy[0] + np.pi) % (2 * np.pi) - np.pi
        dy = (y - final_xy[1] + np.pi) % (2 * np.pi) - np.pi
        dists.append((float(np.sqrt(dx * dx + dy * dy)), i))
    dists.sort(key=lambda item: item[0])
    return dists[:top_k]


def analyze_torus_flow(
    docs,
    query,
    doc_emb=None,
    query_emb=None,
    *,
    n_clusters: int = 5,
    dt: float = 0.02,
    friction: float = 0.01,
    epsilon: float = 0.15,
    max_steps: int = 1500,
    tol_speed: float = 1e-3,
    geometry_R: float = 1.2,
    geometry_r: float = 0.6,
    embedding_model: str = "qllama/bge-m3:q8_0",
):
    """Чистое ядро GW-Collapser: вычисляет layout, flow, top-k и MMSS."""
    if not docs:
        raise ValueError("docs must not be empty")
    if not query:
        raise ValueError("query must not be empty")

    docs = [str(doc) for doc in docs]
    query = str(query)

    if doc_emb is None or query_emb is None:
        doc_vectors, query_vector = get_embeddings_ollama(docs, query, model=embedding_model)
    else:
        doc_vectors, query_vector = _coerce_embeddings(doc_emb, query_emb)

    geometry = TorusGeometry(R=geometry_R, r=geometry_r)
    adapter = HFieldAdapter(n_clusters=n_clusters)
    doc_coords, labels = adapter.build_layout(doc_vectors)
    query_x, query_y = adapter.project_query(query_vector)

    field = TorusFlowField(geometry, epsilon=epsilon)
    for source in build_flow_sources(doc_coords, docs):
        field.add_source(source)

    traj = trace_flow(
        field,
        query_x,
        query_y,
        dt=dt,
        max_steps=max_steps,
        tol_speed=tol_speed,
        friction=friction,
    )
    mmss_metrics = MMSSMetrics(docs, doc_vectors, doc_coords, labels, traj, query)
    top_docs = [
        {"rank": rank, "index": idx, "text": docs[idx], "distance": dist, "cluster": int(labels[idx])}
        for rank, (dist, idx) in enumerate(compute_topk_attractor_docs(doc_coords, traj["final"], top_k=10), start=1)
    ]

    return {
        "docs": docs,
        "query": query,
        "doc_coords": doc_coords,
        "labels": labels,
        "flow": {
            "history": traj["history"],
            "speeds": traj["speeds"],
            "final": traj["final"],
            "start": np.array([query_x, query_y], dtype=float),
        },
        "mmss": mmss_metrics.compute_Q(),
        "top_docs": top_docs,
        "torus_geometry": {"R": geometry.R, "r": geometry.r},
        "parameters": {
            "n_clusters": n_clusters,
            "dt": dt,
            "friction": friction,
            "epsilon": epsilon,
            "max_steps": max_steps,
            "tol_speed": tol_speed,
            "embedding_model": embedding_model,
        },
        "embedding_shape": list(doc_vectors.shape),
    }


def serialize_torus_for_web(result: dict):
    doc_coords = np.asarray(result["doc_coords"])
    labels = np.asarray(result["labels"])
    return {
        "torus": result["torus_geometry"],
        "docs": [
            {
                "id": index,
                "x": float(x),
                "y": float(y),
                "cluster": int(labels[index]),
                "label": " ".join(result["docs"][index].split()[:3]),
                "text": result["docs"][index],
            }
            for index, (x, y) in enumerate(doc_coords)
        ],
        "flow": {
            "path": np.asarray(result["flow"]["history"]).tolist(),
            "final": np.asarray(result["flow"]["final"]).tolist(),
            "start": np.asarray(result["flow"]["start"]).tolist(),
            "speeds": np.asarray(result["flow"]["speeds"]).tolist(),
        },
        "mmss": result["mmss"],
        "top_docs": result["top_docs"],
        "query": result["query"],
        "parameters": result["parameters"],
    }


def visualize_torus_flow_matplotlib(result: dict):
    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise RuntimeError("matplotlib is required for visualize_torus_flow_matplotlib") from exc

    geometry_cfg = result["torus_geometry"]
    geometry = TorusGeometry(R=geometry_cfg["R"], r=geometry_cfg["r"])
    doc_coords = np.asarray(result["doc_coords"])
    labels = np.asarray(result["labels"])
    traj_xy = np.asarray(result["flow"]["history"])
    docs = result["docs"]
    query_text = result["query"]

    plt.style.use("dark_background")
    _, _, X, Y, Z = geometry.grid(nu=40, nv=40)

    fig = plt.figure(figsize=(16, 10))
    ax = fig.add_subplot(111, projection="3d")
    ax.set_facecolor("#000000")
    fig.patch.set_facecolor("#000000")
    ax.plot_surface(X, Y, Z, color="#333333", alpha=0.3, edgecolor="none", shade=True)

    doc_cart = np.array([geometry.to_3d(x, y) for x, y in doc_coords])
    cluster_colors = ["#FF5555", "#55AAFF", "#55FF55", "#FFAA55", "#AA55FF"]
    for i, (x, y, z) in enumerate(doc_cart):
        color = cluster_colors[int(labels[i]) % len(cluster_colors)]
        ax.scatter(x, y, z, color=color, s=30, alpha=0.9, edgecolors="none")
        ax.text(
            x,
            y,
            z,
            " ".join(docs[i].split()[:3]),
            size=6,
            alpha=0.8,
            color="white",
            bbox=dict(boxstyle="round,pad=0.2", facecolor="black", alpha=0.7),
        )

    traj_cart = np.array([geometry.to_3d(x, y) for x, y in traj_xy])
    ax.plot(traj_cart[:, 0], traj_cart[:, 1], traj_cart[:, 2], color="#00FFFF", linewidth=2.5, alpha=0.9, label="Линия тока запроса")
    ax.plot(traj_cart[:, 0], traj_cart[:, 1], traj_cart[:, 2], color="#33FFFF", linewidth=5.0, alpha=0.2)

    start_point = geometry.to_3d(*traj_xy[0])
    end_point = geometry.to_3d(*traj_xy[-1])
    ax.scatter(*start_point, color="#00FF00", s=120, alpha=1.0, edgecolors="none")
    ax.text(*start_point, "Запрос", color="lime", size=10, weight="bold", bbox=dict(boxstyle="round,pad=0.3", facecolor="black", alpha=0.7))
    ax.scatter(*end_point, color="#FFD700", s=160, alpha=1.0, edgecolors="none")
    ax.text(*end_point, "Аттрактор", color="gold", size=10, weight="bold", bbox=dict(boxstyle="round,pad=0.3", facecolor="black", alpha=0.7))

    ax.set_title(f"Torus Flow – живая геометрия смысла\nЗапрос: '{query_text[:70]}...'", color="#EEEEEE", fontsize=14, pad=20)
    legend = ax.legend(loc="upper left", fontsize=8, facecolor="#111111", edgecolor="#444444")
    for text in legend.get_texts():
        text.set_color("#DDDDDD")
    ax.set_axis_off()
    plt.tight_layout()
    plt.show()

    fig2, axes = plt.subplots(1, 2, figsize=(12, 4))
    fig2.patch.set_facecolor("#000000")
    speeds = np.asarray(result["flow"]["speeds"])
    axes[0].set_facecolor("#000000")
    axes[0].plot(np.arange(len(speeds)), speeds, color="#FF4444", linewidth=2)
    axes[0].set_title("Скорость вдоль линии тока", color="#EEEEEE")
    axes[0].set_xlabel("Шаг", color="#DDDDDD")
    axes[0].set_ylabel("|v|", color="#DDDDDD")
    axes[0].grid(True, alpha=0.2, color="#555555")
    axes[0].tick_params(colors="#DDDDDD")

    axes[1].set_facecolor("#000000")
    axes[1].plot(traj_xy[:, 0], traj_xy[:, 1], color="#00FFFF")
    axes[1].scatter(traj_xy[0, 0], traj_xy[0, 1], color="#00FF00", label="Старт")
    axes[1].scatter(traj_xy[-1, 0], traj_xy[-1, 1], color="#FFD700", label="Аттрактор")
    axes[1].set_title("Траектория в координатах T² (x,y)", color="#EEEEEE")
    axes[1].set_xlabel("x", color="#DDDDDD")
    axes[1].set_ylabel("y", color="#DDDDDD")
    axes[1].legend(facecolor="#111111", edgecolor="#444444")
    axes[1].grid(True, alpha=0.2, color="#555555")
    axes[1].tick_params(colors="#DDDDDD")
    plt.tight_layout()
    plt.show()


def print_detailed_report(result: dict):
    docs = result["docs"]
    doc_coords = np.asarray(result["doc_coords"])
    labels = np.asarray(result["labels"])
    hist = np.asarray(result["flow"]["history"])
    speeds = np.asarray(result["flow"]["speeds"])
    final = np.asarray(result["flow"]["final"])
    params = result["parameters"]

    print("\n" + "=" * 80)
    print("                            ДЕТАЛЬНЫЙ ОТЧЁТ + MMSS")
    print("=" * 80)
    print("\n--- ПАРАМЕТРЫ ЭКСПЕРИМЕНТА ---")
    print(f"Количество документов:        {len(docs)}")
    print(f"Размерность эмбеддингов:       {tuple(result['embedding_shape'])}")
    print(f"Количество кластеров:          {params['n_clusters']}")
    print(f"Шаг интегрирования dt:         {params['dt']}")
    print(f"Сглаживание поля ε:            {params['epsilon']}")
    print(f"Запрос:                        '{result['query'][:80]}...'")

    path_length = 0.0
    for i in range(1, len(hist)):
        dx = (hist[i, 0] - hist[i - 1, 0] + np.pi) % (2 * np.pi) - np.pi
        dy = (hist[i, 1] - hist[i - 1, 1] + np.pi) % (2 * np.pi) - np.pi
        path_length += np.sqrt(dx * dx + dy * dy)

    print("\n--- ТРАЕКТОРИЯ ЗАПРОСА ---")
    print(f"Число шагов интегрирования:   {len(hist)}")
    print(f"Общая длина пути (в T²):       {path_length:.4f}")
    print(f"Средняя скорость:              {float(np.mean(speeds)):.4f}")
    print(f"Финальная скорость:            {float(speeds[-1]) if len(speeds) else 0.0:.4f}")
    print(f"Финальная точка (x, y):        ({final[0]:.4f}, {final[1]:.4f})")

    unique, counts = np.unique(labels, return_counts=True)
    print("\n--- РАСПРЕДЕЛЕНИЕ ДОКУМЕНТОВ ПО КЛАСТЕРАМ ---")
    for cluster, count in zip(unique, counts):
        print(f"Кластер {int(cluster)}: {int(count)} документов")

    print("\n--- БЛИЖАЙШИЕ К АТТРАКТОРУ (ТОП-10) ---")
    for item in result["top_docs"]:
        print(f"{item['rank']:2d}. {item['text'][:50]:50}  dist={item['distance']:.4f}  (кластер {item['cluster']})")

    all_dists = compute_topk_attractor_docs(doc_coords, final, top_k=len(doc_coords))
    if all_dists:
        values = [dist for dist, _ in all_dists]
        print(f"\nСреднее расстояние до аттрактора: {float(np.mean(values)):.4f}")
        print(f"Медианное расстояние:             {float(np.median(values)):.4f}")

    mmss = result["mmss"]
    print("\n--- MMSS-ИНВАРИАНТЫ ---")
    print(f"V  (Volume)      = {mmss['V']:.4f}")
    print(f"S  (Stability)   = {mmss['S']:.4f}")
    print(f"N  (Noise)       = {mmss['N']:.4f}")
    print(f"D_f (Fractal)    = {mmss['D_f']:.4f}")
    print(f"QEC (Collapse)   = {mmss['QEC']:.4f}")
    print(f"CHSH (Contrast)  = {mmss['CHSH']:.4f}")
    print(f"Q  (Quality)     = {mmss['Q']:.4f}")
    print("\n" + "=" * 80)
