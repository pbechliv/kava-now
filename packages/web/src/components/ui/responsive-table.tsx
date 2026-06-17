import * as React from "react";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { cn } from "@/lib/utils";

export interface ResponsiveTableColumn<T> {
  header?: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  headClassName?: string;
  cellClassName?: string;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: ResponsiveTableColumn<T>[];
  getRowKey: (row: T) => string;
  // Renders the inner content of each mobile card; the surrounding
  // `MobileListItem` (key, click, hover) is owned by this component.
  renderMobileItem: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  mobileItemClassName?: (row: T) => string | undefined;
  // When set and `data` is empty, renders an in-card empty message instead of
  // rows. Pages that guard the empty case upstream can leave this unset.
  emptyMessage?: string;
}

// The shared desktop-table + mobile-card list pattern. A `Card` wraps a
// `<Table>` (visible from `md` up) paired with a `MobileList` of cards below
// `md`, both rendered from the same `data`.
export function ResponsiveTable<T>({
  data,
  columns,
  getRowKey,
  renderMobileItem,
  onRowClick,
  rowClassName,
  mobileItemClassName,
  emptyMessage,
}: ResponsiveTableProps<T>) {
  const isEmpty = data.length === 0 && emptyMessage != null;

  return (
    <Card className="overflow-hidden">
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead key={i} className={col.headClassName}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isEmpty ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow
                  key={getRowKey(row)}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col, i) => (
                    <TableCell key={i} className={col.cellClassName}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {isEmpty ? (
        <p className="py-8 text-center text-muted-foreground md:hidden">{emptyMessage}</p>
      ) : (
        <MobileList>
          {data.map((row) => (
            <MobileListItem
              key={getRowKey(row)}
              className={cn(
                onRowClick && "cursor-pointer transition-colors hover:bg-muted/50",
                mobileItemClassName?.(row),
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {renderMobileItem(row)}
            </MobileListItem>
          ))}
        </MobileList>
      )}
    </Card>
  );
}
