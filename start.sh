#!/bin/sh
export N8N_PORT=${PORT:-5678}
exec n8n start
