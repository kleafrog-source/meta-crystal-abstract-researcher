"use client";

import { Save, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FieldHint, FieldLabel } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProfileLibraryBar({
  title = "Профили",
  profiles,
  selectedProfile,
  editableName,
  onEditableNameChange,
  onSelectProfile,
  onSave,
  onSaveAs,
  onDelete,
}: {
  title?: string;
  profiles: Array<{ id: string; name: string }>;
  selectedProfile: string;
  editableName: string;
  onEditableNameChange: (value: string) => void;
  onSelectProfile: (value: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr_auto_auto_auto] lg:items-end">
        <div className="space-y-1.5">
          <FieldLabel
            label={title}
            hint="Имя профиля текущего режима. Здесь задается название для сохранения, копирования или обновления текущего набора настроек."
          />
          <Input
            value={editableName}
            onChange={(e) => onEditableNameChange(e.target.value)}
            placeholder="Введите имя профиля"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel
            label="Загрузить сохраненный профиль"
            hint="Выбор ранее сохраненного профиля именно для этого режима интерфейса. После выбора форма заполняется его параметрами."
          />
          <Select
            value={selectedProfile || "__none__"}
            onValueChange={(value) => value !== "__none__" && onSelectProfile(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите профиль" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Не выбран</SelectItem>
              {profiles.map((item) => (
                <SelectItem key={item.id} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={onSave}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Сохранить
        </Button>
        <Button variant="outline" size="sm" onClick={onSaveAs}>
          Сохранить как
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} disabled={!selectedProfile}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5 text-rose-400" />
          Удалить
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>Сохранить</span>
          <FieldHint hint="Перезаписывает профиль с текущим именем, сохраняя флаги, роли метрик, паттерны и параметры." />
        </div>
        <div className="flex items-center gap-1">
          <span>Сохранить как</span>
          <FieldHint hint="Создает новый профиль под указанным именем без изменения исходного сохраненного профиля." />
        </div>
        <div className="flex items-center gap-1">
          <span>Удалить</span>
          <FieldHint hint="Удаляет выбранный профиль текущего режима. Используйте осторожно: действие убирает запись из локального хранилища профилей." />
        </div>
      </div>
    </div>
  );
}
