{{- define "lt.name" -}}lecture-tests{{- end -}}

{{- define "lt.labels" -}}
app.kubernetes.io/name: lecture-tests
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "lt.databaseUrl" -}}
postgresql+asyncpg://{{ .Values.postgres.user }}:{{ .Values.postgres.password }}@lecture-tests-postgres:5432/{{ .Values.postgres.db }}
{{- end -}}
