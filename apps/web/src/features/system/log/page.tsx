import { useEffect, useState } from "react"
import type { JSX, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { EyeIcon, ScrollTextIcon } from "lucide-react"

import { apiErrorMessage } from "@/api/client"
import { PageHeader } from "@/components/business/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePagination } from "@/hooks/usePagination"
import { formatDateTime } from "@/lib/datetime"
import { useLoginLogsQuery, useOperationLogsQuery, type LoginLogItem, type OperationLogItem } from "./useLogs"

const PAGE_SIZE = 10

/** 请求体快照美化：合法 JSON 缩进格式化，截断/非 JSON 原样展示 */
function formatJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

interface Column<T extends { id: string }> {
  key: string
  header: string
  render: (row: T) => ReactNode
}

/** 日志表通用渲染（登录/操作两个 Tab 共用）：搜索 + 表格（骨架/空态/错误态）+ 分页 */
function LogTable<T extends { id: string }>(props: {
  columns: Column<T>[]
  rows: T[]
  isLoading: boolean
  isError: boolean
  errorMessage: string
  searchPlaceholder: string
  searchValue: string
  onSearchValueChange: (value: string) => void
  onSearch: () => void
  page: number
  totalPages: number
  onGotoPage: (page: number) => void
}): JSX.Element {
  const { t } = useTranslation("logs")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input
          value={props.searchValue}
          onChange={(event) => {
            props.onSearchValueChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onSearch()
          }}
          placeholder={props.searchPlaceholder}
          className="h-9 w-64"
        />
        <Button variant="outline" type="button" onClick={props.onSearch} className="h-9">
          {t("search")}
        </Button>
      </div>

      {props.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {props.errorMessage}
        </p>
      ) : !props.isLoading && props.rows.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <ScrollTextIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("noData")}</EmptyTitle>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_th]:text-muted-foreground [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              {props.columns.map((column) => (
                <TableHead key={column.key}>{column.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.isLoading
              ? Array.from({ length: 5 }, (_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {props.columns.map((column) => (
                      <TableCell key={column.key}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : props.rows.map((row) => (
                  <TableRow key={row.id}>
                    {props.columns.map((column) => (
                      <TableCell key={column.key}>{column.render(row)}</TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}

      {props.totalPages > 1 && (
        <Pagination className="justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                text={t("previous")}
                aria-label={t("previous")}
                onClick={(event) => {
                  event.preventDefault()
                  if (props.page > 1) props.onGotoPage(props.page - 1)
                }}
              />
            </PaginationItem>
            {props.totalPages > 7 ? (
              // 页数过多截断：首页 + 省略号 + 末页（简单实现，prev/next 仍可翻页）
              <>
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    isActive={props.page === 1}
                    onClick={(event) => {
                      event.preventDefault()
                      props.onGotoPage(1)
                    }}
                  >
                    1
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    isActive={props.page === props.totalPages}
                    onClick={(event) => {
                      event.preventDefault()
                      props.onGotoPage(props.totalPages)
                    }}
                  >
                    {props.totalPages}
                  </PaginationLink>
                </PaginationItem>
              </>
            ) : (
              Array.from({ length: props.totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    href="#"
                    isActive={pageNumber === props.page}
                    onClick={(event) => {
                      event.preventDefault()
                      props.onGotoPage(pageNumber)
                    }}
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              ))
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                text={t("next")}
                aria-label={t("next")}
                onClick={(event) => {
                  event.preventDefault()
                  if (props.page < props.totalPages) props.onGotoPage(props.page + 1)
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}

/**
 * 日志管理页：Tabs 切换登录日志 / 操作日志，各自独立的关键词搜索 + 分页表格。
 * 只读页面（无写操作）；访问受服务端 system:log:query 权限保护。
 */
export default function LogPage(): JSX.Element {
  const { t } = useTranslation("logs")

  const {
    page: loginPage,
    totalPages: loginTotalPages,
    setPage: setLoginPage,
    setTotalPages: setLoginTotalPages,
  } = usePagination(1, PAGE_SIZE)
  const [loginKeywordInput, setLoginKeywordInput] = useState("")
  const [loginKeyword, setLoginKeyword] = useState("")

  const {
    page: opPage,
    totalPages: opTotalPages,
    setPage: setOpPage,
    setTotalPages: setOpTotalPages,
  } = usePagination(1, PAGE_SIZE)
  const [opKeywordInput, setOpKeywordInput] = useState("")
  const [opKeyword, setOpKeyword] = useState("")
  const [detailRow, setDetailRow] = useState<OperationLogItem | null>(null)

  const loginQuery = useLoginLogsQuery(loginPage, PAGE_SIZE, loginKeyword)
  const opQuery = useOperationLogsQuery(opPage, PAGE_SIZE, opKeyword)

  // 数据就绪后同步 totalPages（usePagination 内部在 totalPages 变小时自动钳制 page；
  // 仅 data 存在时写入，避免 pending 瞬间把 page 拽回首页）
  useEffect(() => {
    if (loginQuery.data) setLoginTotalPages(Math.max(1, Math.ceil(loginQuery.data.total / PAGE_SIZE)))
  }, [loginQuery.data, setLoginTotalPages])
  useEffect(() => {
    if (opQuery.data) setOpTotalPages(Math.max(1, Math.ceil(opQuery.data.total / PAGE_SIZE)))
  }, [opQuery.data, setOpTotalPages])

  const loginColumns: Column<LoginLogItem>[] = [
    { key: "username", header: t("username"), render: (row) => row.username },
    {
      key: "status",
      header: t("result"),
      render: (row) => (
        <Badge variant={row.status === "SUCCESS" ? "default" : "destructive"}>
          {row.status === "SUCCESS" ? t("success") : t("failed")}
        </Badge>
      ),
    },
    { key: "ip", header: t("ip"), render: (row) => row.ip ?? "-" },
    {
      key: "userAgent",
      header: t("browser"),
      render: (row) =>
        row.userAgent ? (
          <span className="block max-w-56 truncate" title={row.userAgent}>
            {row.userAgent}
          </span>
        ) : (
          "-"
        ),
    },
    { key: "message", header: t("reason"), render: (row) => row.message ?? "-" },
    { key: "createdAt", header: t("time"), render: (row) => formatDateTime(row.createdAt) },
  ]

  const opColumns: Column<OperationLogItem>[] = [
    { key: "username", header: t("username"), render: (row) => row.username ?? "-" },
    { key: "method", header: t("method"), render: (row) => <Badge variant="outline">{row.method}</Badge> },
    {
      key: "path",
      header: t("path"),
      render: (row) => (
        <span className="block max-w-64 truncate" title={row.path}>
          {row.path}
        </span>
      ),
    },
    {
      key: "statusCode",
      header: t("statusCode"),
      render: (row) => (
        <span className={row.statusCode >= 400 ? "font-medium text-destructive" : undefined}>{row.statusCode}</span>
      ),
    },
    {
      key: "durationMs",
      header: t("duration"),
      render: (row) => (
        <span>
          {String(row.durationMs)} {t("ms")}
        </span>
      ),
    },
    { key: "ip", header: t("ip"), render: (row) => row.ip ?? "-" },
    { key: "createdAt", header: t("time"), render: (row) => formatDateTime(row.createdAt) },
    {
      key: "actions",
      header: t("actions"),
      render: (row) =>
        row.requestBody || row.errorMessage ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDetailRow(row)
            }}
          >
            <EyeIcon />
            {t("details")}
          </Button>
        ) : (
          "-"
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("desc")} />

      <Tabs defaultValue="login">
        <TabsList>
          <TabsTrigger value="login">{t("tabLogin")}</TabsTrigger>
          <TabsTrigger value="operation">{t("tabOperation")}</TabsTrigger>
        </TabsList>
        <TabsContent value="login">
          <LogTable<LoginLogItem>
            columns={loginColumns}
            rows={loginQuery.data?.list ?? []}
            isLoading={loginQuery.isLoading}
            isError={loginQuery.isError}
            errorMessage={apiErrorMessage(loginQuery.error)}
            searchPlaceholder={t("searchPlaceholderLogin")}
            searchValue={loginKeywordInput}
            onSearchValueChange={setLoginKeywordInput}
            onSearch={() => {
              setLoginKeyword(loginKeywordInput.trim())
              setLoginPage(1)
            }}
            page={loginPage}
            totalPages={loginTotalPages}
            onGotoPage={setLoginPage}
          />
        </TabsContent>
        <TabsContent value="operation">
          <LogTable<OperationLogItem>
            columns={opColumns}
            rows={opQuery.data?.list ?? []}
            isLoading={opQuery.isLoading}
            isError={opQuery.isError}
            errorMessage={apiErrorMessage(opQuery.error)}
            searchPlaceholder={t("searchPlaceholderOperation")}
            searchValue={opKeywordInput}
            onSearchValueChange={setOpKeywordInput}
            onSearch={() => {
              setOpKeyword(opKeywordInput.trim())
              setOpPage(1)
            }}
            page={opPage}
            totalPages={opTotalPages}
            onGotoPage={setOpPage}
          />
        </TabsContent>
      </Tabs>

      {/* 操作日志详情：请求体快照 + 错误信息（无快照记录时按钮不显示） */}
      {detailRow && (
        <Dialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDetailRow(null)
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("detailsTitle")}</DialogTitle>
              <DialogDescription>
                {detailRow.method} {detailRow.path}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                <span>
                  {t("username")}：{detailRow.username ?? "-"}
                </span>
                <span>
                  {t("statusCode")}：{detailRow.statusCode}
                </span>
                <span>
                  {t("time")}：{formatDateTime(detailRow.createdAt)}
                </span>
              </div>
              {detailRow.errorMessage && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("errorMessage")}</span>
                  <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs text-destructive">
                    {detailRow.errorMessage}
                  </pre>
                </div>
              )}
              {detailRow.requestBody && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("requestBody")}</span>
                  {/* 请求体为服务端截断的 JSON 文本，尝试格式化展示，失败原样展示 */}
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs">
                    {formatJson(detailRow.requestBody)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
