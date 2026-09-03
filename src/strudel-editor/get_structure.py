import requests
import json

def get_structure(owner, repo, branch="main", output_file=""):
    tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    headers = {"Accept": "application/vnd.github.v3+json"}
    
    response = requests.get(tree_url, headers=headers)
    if response.status_code != 200:
        print(f"Error API: {response.status_code}")
        return

    data = response.json()
    tree = data.get("tree", [])
    structure = [{'path': item['path'], 'type': item['type'], 'size': item.get('size', 0)} for item in tree]
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(structure, f, indent=2)
    
    print(f"Saved structure: {len(structure)} files/folders")

if __name__ == "__main__":
    get_structure("algorave-dave", "samples", "main", "./samples/algorave-dave_structure.json")
