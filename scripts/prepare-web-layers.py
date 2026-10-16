"""Keep unchanged public media in independent image layers; regenerate APK hashes."""
import argparse
import hashlib
import importlib.util
import json
import shutil
from pathlib import Path, PurePosixPath


def read_plan(path):
    plan = json.loads(Path(path).read_text())
    if plan.get('schema') != 1:
        raise ValueError('Unsupported web layer plan')
    sources, destinations = set(), set()
    for item in plan['layers']:
        source, destination = item['source'], item['destination']
        if source.startswith('/') or '..' in PurePosixPath(source).parts:
            raise ValueError('Invalid layer source')
        if not destination.startswith('/srv/frontend/') or '..' in PurePosixPath(destination).parts:
            raise ValueError('Invalid layer destination')
        if source in sources or destination in destinations:
            raise ValueError('Duplicate media layer')
        sources.add(source)
        destinations.add(destination)
    return plan


def dockerfile(plan):
    lines = [
        '# syntax=docker/dockerfile:1.4',
        '# Media layers are independent; the small code/index layer changes per release.',
        'FROM python:3.13-alpine AS content-index',
        'COPY scripts/build-apk-content.py scripts/prepare-web-layers.py scripts/web-layer-plan.json /tool/',
        'RUN --mount=type=bind,target=/source,ro python /tool/prepare-web-layers.py --root /source --output /out --plan /tool/web-layer-plan.json',
        '',
        'FROM caddy:2-alpine',
    ]
    for item in plan['layers']:
        lines.append('COPY --link ' + json.dumps([item['source'], item['destination']], ensure_ascii=False))
    lines += [
        'COPY --link --from=content-index /out/frontend/ /srv/frontend/',
        'COPY --link Caddyfile /etc/caddy/Caddyfile',
        'EXPOSE 80',
    ]
    return '\n'.join(lines) + '\n'


def prepare(root, output, plan):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output == root or output.is_relative_to(root):
        raise ValueError('Build output must be outside source tree')
    excluded = {i['source'][len('frontend/'):] for i in plan['layers'] if i['source'].startswith('frontend/')}
    for item in plan['layers']:
        if not (root / item['source']).is_dir():
            raise ValueError('Missing configured media directory: ' + item['source'])
    if output.exists():
        shutil.rmtree(output)
    frontend = root / 'frontend'

    def ignore(directory, names):
        relative = Path(directory).relative_to(frontend)
        return [name for name in names if (relative / name).as_posix() in excluded]

    shutil.copytree(frontend, output / 'frontend', symlinks=True, ignore=ignore)
    spec = importlib.util.spec_from_file_location('apk_content', Path(__file__).with_name('build-apk-content.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    files = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in module.sources(root)}
    (output / 'frontend/apk-content-manifest.json').write_text(
        json.dumps({'schema': 1, 'files': files}, ensure_ascii=False, separators=(',', ':')) + '\n'
    )
    print('Web content index:', len(files), '; independent media layers:', len(plan['layers']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--plan', type=Path, default=Path(__file__).with_name('web-layer-plan.json'))
    parser.add_argument('--dockerfile', action='store_true')
    args = parser.parse_args()
    plan = read_plan(args.plan)
    if args.dockerfile:
        print(dockerfile(plan), end='')
    else:
        prepare(args.root, args.output, plan)
