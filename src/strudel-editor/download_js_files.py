import requests
import os

def download_js_files(owner, repo, branch="main", target_dir="./data/datasets/strudel_code_corpus"):
    print(f"🔍 Анализ: {owner}/{repo}")
    tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    headers = {"Accept": "application/vnd.github.v3+json"}
    
    response = requests.get(tree_url, headers=headers)
    if response.status_code != 200:
        print(f"❌ Ошибка API: {response.status_code}")
        return

    js_files = [item for item in response.json().get("tree", []) if item["type"] == "blob" and item["path"].endswith(".js")]
    print(f"✅ Найдено {len(js_files)} файлов .js")

    for file_info in js_files:
        file_path = file_info["path"]
        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"
        local_path = os.path.join(target_dir, file_path)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        
        r = requests.get(raw_url)
        if r.status_code == 200:
            with open(local_path, "w", encoding="utf-8") as f:
                f.write(r.text)
            print(f"  ⬇️ {file_path}")

if __name__ == "__main__":
    download_js_files("Mariaareadne1", "maria-live-codes", "master", "./data/datasets/strudel_code_corpus/maria")
