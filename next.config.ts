import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg"],
    // partly-api/data is read dynamically (path built from a vehicle slug at
    // request time), so Next's static file-tracing can't discover it on its
    // own — without this, the serverless bundle silently omits the dataset.
    outputFileTracingIncludes: {
        "/**": ["./partly-api/data/**"],
    },
};

export default nextConfig;
