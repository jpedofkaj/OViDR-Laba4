"""Локальный сервер статического сайта. Внешние Python-пакеты не нужны."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=8000, type=int)
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    try:
        server = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as error:
        parser.exit(1, f'Не удалось запустить сервер: {error}\nПопробуйте: python server.py --port 8001\n')
    print(f'Сайт: http://localhost:{args.port}\nОстановить: Ctrl+C', flush=True)
    if args.host != '127.0.0.1':
        print('Сервер доступен по сети. Для камеры на телефоне нужен HTTPS-хостинг.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nСервер остановлен.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
