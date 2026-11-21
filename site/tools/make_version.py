#!/usr/bin/env python3
"""Regenerate version.json from index.html (run after every library rebuild, before pushing site/).

  python3 tools/make_version.py                 # same version, build + 1
  python3 tools/make_version.py --version 1.1.0 # new human version, build + 1
  python3 tools/make_version.py --build 7       # set the build number explicitly

The app only installs a download whose build number is higher than the one it already has and whose sha256 matches,
so the build number must go up on every published change (this script does that for you).
"""
import argparse, hashlib, json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); site = os.path.dirname(here)
ap = argparse.ArgumentParser()
ap.add_argument('--version'); ap.add_argument('--build', type=int)
a = ap.parse_args()
idx = os.path.join(site, 'index.html'); vj = os.path.join(site, 'version.json')
if not os.path.isfile(idx): sys.exit('index.html not found next to tools/')
sha = hashlib.sha256(open(idx, 'rb').read()).hexdigest()
old = json.load(open(vj)) if os.path.isfile(vj) else {'version': '1.0.0', 'build': 0}
if old.get('sha256') == sha and not (a.version or a.build):
    print('index.html unchanged, version.json left as is (build %s)' % old['build']); sys.exit(0)
build = a.build if a.build else int(old['build']) + 1
if build <= int(old['build']) and old.get('sha256') != sha: sys.exit('build must be higher than %s' % old['build'])
out = {'version': a.version or old['version'], 'build': build, 'file': 'index.html', 'sha256': sha}
open(vj, 'w').write(json.dumps(out, indent=2) + '\n')
print('version.json ->', json.dumps(out))
