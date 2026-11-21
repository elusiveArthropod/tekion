"""Upload every fixture in ./fixtures and write files.json (name -> file object)."""
import json
import os
import sys

from ua_upload import upload

out = json.load(open("files.json")) if os.path.exists("files.json") else {}
force = "--force" in sys.argv
for f in sorted(os.listdir("fixtures")):
    if not f.endswith(".xlsx"):
        continue
    name = f[:-5]
    if name in out and not force:
        continue
    obj, _ = upload(os.path.join("fixtures", f))
    obj.pop("url", None)
    out[name] = obj
    print(name, obj["source"], flush=True)
    json.dump(out, open("files.json", "w"), indent=1)
print("files:", len(out))
