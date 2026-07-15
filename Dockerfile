ARG NODE_IMAGE=node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.28.1-alpine-slim@sha256:ce7786ca8aeaa99d6633bc65346b2dca33b098d41a1b670dcf78bb8f1489eded

FROM ${NODE_IMAGE} AS verify

WORKDIR /src

COPY package.json package-lock.json ./
COPY index.html styles.css campaign.js game.js ./
COPY generator/ ./generator/
COPY systems/ ./systems/
COPY legacy/ ./legacy/
COPY visual/ ./visual/
COPY content/ ./content/
COPY tier-01-v2/content/ ./tier-01-v2/content/
COPY tier-01-v2/scripts/ ./tier-01-v2/scripts/
COPY art/runtime-v2/ ./art/runtime-v2/
COPY scripts/ ./scripts/

RUN npm run test:docker:prebuild

FROM verify AS package

RUN node scripts/build-static-dist.mjs --output /dist

FROM ${NGINX_IMAGE} AS runtime

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
ARG BUILD_CONTEXT_SHA=unknown
ARG BUILD_DIRTY=unknown

LABEL org.opencontainers.image.title="VetGEME static clinic" \
      org.opencontainers.image.description="Read-only local browser runtime for VetGEME" \
      org.opencontainers.image.source="https://github.com/Pivotemnoe/VetGEME" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      io.vetgeme.build-context-sha256="${BUILD_CONTEXT_SHA}" \
      io.vetgeme.build-dirty="${BUILD_DIRTY}"

USER root
RUN rm -rf /usr/share/nginx/html \
    && mkdir -p /usr/share/nginx/html \
    && chown 101:101 /usr/share/nginx/html

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=package --chown=101:101 /dist/ /usr/share/nginx/html/

USER 101:101

EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
