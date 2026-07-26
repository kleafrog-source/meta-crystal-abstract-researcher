import torch

# Загружаем файл (рекомендую указать map_location='cpu', если нет CUDA)
data = torch.load('v22_hyper_ollama_distilled.pt', map_location='cpu')

# Теперь data — это словарь (dict). Смотрим, что внутри:
print(data.keys())