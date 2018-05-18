#!/usr/bin/env bash

set -e;

if [ -f package.json ]; then
  echo "there is no package.json file in your PWD." >&2;
  false;
fi

name="$(axxel package.json 'name')";

container="docker_r2g/$name";
docker stop "$container"
docker rm "$container"

tag="docker_r2g_image/$name";
shared="r2g_shared_dir"

docker build -t "$tag" .
docker run -it -v "$HOME:/$shared:ro" --name ts-project "$tag"