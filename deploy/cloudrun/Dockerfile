# Static image for the paper2notes site on Cloud Run.
# Build from the repo root so notes/ is in the context (see .dockerignore):
#   docker build -f deploy/cloudrun/Dockerfile .
FROM nginxinc/nginx-unprivileged:stable-alpine

COPY deploy/cloudrun/nginx.conf /etc/nginx/conf.d/default.conf
# .dockerignore keeps notes/_source, _local and *.test.mjs out of the image.
COPY notes/ /usr/share/nginx/html/

EXPOSE 8080
