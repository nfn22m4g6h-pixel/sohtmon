"use client";

import { useActionState, useRef } from "react";
import { saveProduct } from "./actions";
import type { Category, Product } from "@/lib/types";
import { Card, Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { ScanButton } from "@/components/barcode-scanner";

export function ProductForm({ product, categories }: { product?: Product; categories: Category[] }) {
  const [state, action] = useActionState(saveProduct, null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="space-y-4">
      {product && <input type="hidden" name="id" value={product.id} />}
      <Card className="space-y-4 p-4">
        <Field label="Название *">
          <Input name="name" required defaultValue={product?.name} placeholder="Бетономешалка 180 л" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Артикул">
            <Input name="sku" defaultValue={product?.sku ?? ""} placeholder="BM-180" />
          </Field>
          <Field label="Штрихкод">
            <div className="relative">
              <Input ref={barcodeRef} name="barcode" defaultValue={product?.barcode ?? ""} inputMode="numeric" className="pr-11" />
              <ScanButton
                onResult={(code) => {
                  if (barcodeRef.current) barcodeRef.current.value = code;
                }}
                className="absolute top-1/2 right-1 size-9 -translate-y-1/2"
              />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Категория">
            <Select name="category_id" defaultValue={product?.category_id ?? ""}>
              <option value="">Без категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Единица">
            <Select name="unit" defaultValue={product?.unit ?? "шт"}>
              {["шт", "кг", "м", "м²", "м³", "л", "упак", "компл"].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <p className="text-sm font-semibold">Цены</p>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <Field label="Цена продажи *">
            <Input name="sale_price" inputMode="decimal" required defaultValue={product?.sale_price ?? ""} placeholder="0" />
          </Field>
          <Field label="Валюта">
            <Select name="sale_currency" defaultValue={product?.sale_currency ?? "TJS"}>
              <option>TJS</option>
              <option>CNY</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <Field label="Закупочная цена" hint="Обновляется автоматически при приходе">
            <Input name="purchase_price" inputMode="decimal" defaultValue={product?.purchase_price ?? ""} placeholder="0" />
          </Field>
          <Field label="Валюта">
            <Select name="purchase_currency" defaultValue={product?.purchase_currency ?? "CNY"}>
              <option>CNY</option>
              <option>TJS</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <p className="text-sm font-semibold">Склад</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Мин. остаток" hint="Для уведомления «мало на складе»">
            <Input name="min_stock" inputMode="decimal" defaultValue={product?.min_stock ?? 0} />
          </Field>
          {!product && (
            <Field label="Начальный остаток">
              <Input name="initial_stock" inputMode="decimal" placeholder="0" />
            </Field>
          )}
          {product && (
            <Field label="Статус">
              <Select name="is_active" defaultValue={product.is_active ? "on" : "off"}>
                <option value="on">Активен</option>
                <option value="off">Скрыт из продаж</option>
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg">
        {product ? "Сохранить изменения" : "Создать товар"}
      </SubmitButton>
    </form>
  );
}
