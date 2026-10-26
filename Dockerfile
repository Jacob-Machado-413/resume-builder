# Self-contained image: the React UI, the .NET API and the rendercv CLI it shells out to.
#   docker compose up -d --build      → http://<host>:5180

ARG RENDERCV_VERSION=2.8

# ---- UI ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS ui
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# vite.config.ts writes to ../backend/wwwroot
RUN npm run build

# ---- API --------------------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src/backend
COPY backend/ResumeBuilder.Api.csproj ./
RUN dotnet restore
COPY backend/ ./
COPY --from=ui /src/backend/wwwroot ./wwwroot
RUN dotnet publish -c Release -o /app --no-restore

# ---- runtime ----------------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG RENDERCV_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

# rendercv in its own venv; [full] brings the Typst compiler and bundled fonts.
RUN python3 -m venv /opt/rendercv \
    && /opt/rendercv/bin/pip install --no-cache-dir "rendercv[full]==${RENDERCV_VERSION}"

# Typst fetches @preview packages (e.g. fontawesome) on first use. Render every theme once at build
# time so the cache ships in the image and rendering never needs the internet.
ENV XDG_CACHE_HOME=/opt/cache
RUN mkdir -p /tmp/warm && cd /tmp/warm \
    && for t in classic engineeringresumes engineeringclassic sb2nov moderncv harvard ember ink opal; do \
         /opt/rendercv/bin/rendercv new "Warm Up" --theme "$t" >/dev/null \
         && /opt/rendercv/bin/rendercv render Warm_Up_CV.yaml -nohtml -nomd >/dev/null \
         && rm -rf Warm_Up_CV.yaml rendercv_output || exit 1; \
       done \
    && rm -rf /tmp/warm \
    && chmod -R a+rX /opt/cache

WORKDIR /app
COPY --from=api /app ./
RUN mkdir -p /data && chown "$APP_UID" /data

# Unprefixed keys override appsettings.json (ASPNETCORE_* ones would not).
# Set AllowedHosts to the names you browse to, e.g. "phyllistine-server.local;localhost".
ENV Urls=http://+:5180 \
    ResumeBuilder__DataDirectory=/data \
    ResumeBuilder__RenderCvPath=/opt/rendercv/bin/rendercv \
    AllowedHosts=localhost \
    DOTNET_CLI_TELEMETRY_OPTOUT=1

USER $APP_UID
VOLUME /data
EXPOSE 5180
ENTRYPOINT ["dotnet", "ResumeBuilder.Api.dll"]
