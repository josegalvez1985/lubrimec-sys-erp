import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Eye, MessageSquare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { listarLogsWhatsapp, type LogWhatsappRegistro, type LogWhatsappFiltros } from "@/lib/api";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const ESTADOS = ["ENVIADO", "ERROR", "INVALIDO", "EXCEPCION"] as const;

// Color del badge según el estado del envío.
function badgeEstado(estado: string | null) {
  switch (estado) {
    case "ENVIADO":
      return <Badge className="bg-primary/15 text-primary hover:bg-primary/15">ENVIADO</Badge>;
    case "ERROR":
      return <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">ERROR</Badge>;
    case "INVALIDO":
      return <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">INVÁLIDO</Badge>;
    case "EXCEPCION":
      return <Badge variant="outline" className="text-destructive">EXCEPCIÓN</Badge>;
    default:
      return <Badge variant="outline">{estado ?? "—"}</Badge>;
  }
}

export function LogsWhatsappView() {
  // Filtros aplicados (los que van al query). Los inputs escriben en el borrador.
  const [filtros, setFiltros] = useState<LogWhatsappFiltros>({});
  const [numero, setNumero] = useState("");
  const [estado, setEstado] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [detalle, setDetalle] = useState<LogWhatsappRegistro | null>(null);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["logs-whatsapp", filtros],
    queryFn: () => listarLogsWhatsapp(filtros),
    retry: false,
  });

  const filas = data ?? [];

  function aplicar() {
    setFiltros({
      numero: numero.trim() || undefined,
      estado: estado || undefined,
      fecha_desde: fechaDesde || undefined,
      fecha_hasta: fechaHasta || undefined,
    });
  }

  function limpiar() {
    setNumero("");
    setEstado("");
    setFechaDesde("");
    setFechaHasta("");
    setFiltros({});
  }

  const COLUMNAS: Column<LogWhatsappRegistro>[] = [
    {
      key: "id",
      header: "ID",
      num: true,
      accessor: (r) => r.id,
      className: "w-16",
    },
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => r.fecha ?? "",
      render: (r) => <span className="whitespace-nowrap tabular-nums">{r.fecha}</span>,
    },
    {
      key: "numero_original",
      header: "Número",
      accessor: (r) => r.numero_original ?? "",
      render: (r) => <span className="font-mono">{r.numero_original}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      accessor: (r) => r.estado ?? "",
      render: (r) => badgeEstado(r.estado),
    },
    {
      key: "http_status",
      header: "HTTP",
      num: true,
      accessor: (r) => r.http_status ?? 0,
      render: (r) => <span className="tabular-nums">{r.http_status ?? "—"}</span>,
    },
    {
      key: "detalle_error",
      header: "Detalle",
      accessor: (r) => r.detalle_error ?? "",
      render: (r) => (
        <span className="line-clamp-1 max-w-xs text-muted-foreground">{r.detalle_error}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-elegant sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="f-numero" className="text-xs">Número</Label>
            <Input
              id="f-numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicar()}
              placeholder="Buscar número..."
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-estado" className="text-xs">Estado</Label>
            <select
              id="f-estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className={selectCls}
            >
              <option value="">Todos</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-desde" className="text-xs">Desde</Label>
            <Input
              id="f-desde"
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-hasta" className="text-xs">Hasta</Label>
            <Input
              id="f-hasta"
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={aplicar} className="gap-1">
            <Search className="h-4 w-4" /> Buscar
          </Button>
          <Button variant="outline" onClick={limpiar} className="gap-1">
            <RotateCcw className="h-4 w-4" /> Limpiar
          </Button>
        </div>
      </div>

      {/* Grilla */}
      <div className="rounded-2xl border border-border bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
          <div>
            <h2 className="font-display text-xl font-bold">Logs de WhatsApp</h2>
            <p className="text-sm text-muted-foreground">
              {filas.length} {filas.length === 1 ? "registro" : "registros"}
              {filas.length === 500 ? " (máx.)" : ""}
              {isFetching ? " · actualizando…" : ""}
            </p>
          </div>
        </div>

        {isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar los logs"}
          </p>
        ) : filas.length === 0 && !isLoading ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Sin registros</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              No hay envíos que coincidan con los filtros.
            </p>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <DataTable
              columns={COLUMNAS}
              rows={filas}
              getRowId={(r) => r.id}
              initialSort={{ key: "id", dir: "desc" }}
              exportName="logs-whatsapp"
              actions={(r) => (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setDetalle(r)}
                  aria-label="Ver detalle"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
            />
          </div>
        )}
      </div>

      {/* Modal detalle */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log #{detalle?.id}</DialogTitle>
          </DialogHeader>
          {detalle && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Fecha" valor={detalle.fecha} />
                <Campo label="Estado" valor={detalle.estado} />
                <Campo label="Número original" valor={detalle.numero_original} mono />
                <Campo label="Número limpio" valor={detalle.numero_limpio} mono />
                <Campo label="HTTP status" valor={detalle.http_status?.toString() ?? null} />
              </div>
              {detalle.mensaje && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Mensaje</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">
                    {detalle.mensaje}
                  </p>
                </div>
              )}
              {detalle.detalle_error && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Detalle del error</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                    {detalle.detalle_error}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ label, valor, mono }: { label: string; valor: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono" : ""}>{valor ?? "—"}</p>
    </div>
  );
}
