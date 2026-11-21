"""Upload a local file to UnifyApps cloud storage (the same multipart flow the UI uses).

Returns the file object shape the automation's `Excel` trigger input expects.
"""
import json
import mimetypes
import os
import sys
import urllib.request
import uuid

from ua_api import HOST, COOKIE, call

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _multipart(fields, file_field, filename, content, content_type):
    boundary = "----ua" + uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
    body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\n"
             f"Content-Type: {content_type}\r\n\r\n").encode() + content + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def upload(path, directory=None):
    name = os.path.basename(path)
    mime = mimetypes.guess_type(name)[0] or XLSX
    bucket = call("GET", "/api/file/upload-bucket")
    directory = directory or bucket["directory"]
    up = call("POST", "/api/file/create-multipart-upload",
              {"fileName": name, "mimeType": mime, "directory": directory})
    upload_id = up["uploadId"]
    content = open(path, "rb").read()
    body, ctype = _multipart({"partNumber": "1", "uploadId": upload_id}, "file", name, content, mime)
    req = urllib.request.Request(HOST + "/api/file/upload-part", data=body, method="POST",
                                 headers={"Cookie": f"_at={COOKIE}", "Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=120) as r:
        part = r.read().decode()
    done = call("POST", f"/api/file/complete-multipart-upload?uploadId={upload_id}&isBuilderAsset=false")
    key = done["key"]
    return {"name": name, "source": key, "sourceType": "CLOUD_STORAGE", "fileType": "xlsx",
            "mimeType": mime, "url": done.get("location", "")}, part


if __name__ == "__main__":
    for p in sys.argv[1:]:
        obj, part = upload(p)
        print(json.dumps(obj))
