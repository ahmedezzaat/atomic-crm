import { Pencil, Plus } from "lucide-react";
import {
  RecordContextProvider,
  useCreate,
  useGetList,
  useTranslate,
  useUpdate,
} from "ra-core";
import { useState } from "react";
import { DeleteButton } from "@/components/admin/delete-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { colors } from "../tags/colors";
import { TagDialog } from "../tags/TagDialog";
import type { Tag } from "../types";

type TagData = Pick<Tag, "name" | "color">;

/** Create, rename, recolour and delete the tags that can be put on companies. */
export const SettingsCompanyTags = () => {
  const translate = useTranslate();
  const { data: tags = [], refetch } = useGetList<Tag>("company_tags", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "name", order: "ASC" },
  });
  const [create] = useCreate();
  const [update] = useUpdate();
  const [editing, setEditing] = useState<Tag | "new">();

  const submit = async (data: TagData) => {
    if (editing === "new") {
      await create("company_tags", { data }, { returnPromise: true });
    } else if (editing) {
      await update(
        "company_tags",
        { id: editing.id, data, previousData: editing },
        { returnPromise: true },
      );
    }
    refetch();
  };

  return (
    <Card id="company-tags">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-muted-foreground">
            {translate("resources.company_tags.name", { _: "Company tags" })}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing("new")}
          >
            <Plus />
            {translate("resources.company_tags.add", { _: "Add tag" })}
          </Button>
        </div>
        {tags.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {translate("resources.company_tags.empty", {
              _: "No company tags yet.",
            })}
          </p>
        )}
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center gap-2">
            <span
              className="text-black px-2 py-1 text-sm rounded-md"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(tag)}
              >
                <Pencil />
                {translate("ra.action.edit")}
              </Button>
              <RecordContextProvider value={tag}>
                <DeleteButton
                  resource="company_tags"
                  redirect={false}
                  size="sm"
                  mutationOptions={{ onSuccess: () => refetch() }}
                />
              </RecordContextProvider>
            </div>
          </div>
        ))}
        {editing && (
          <TagDialog
            open
            title={
              editing === "new"
                ? translate("resources.company_tags.create_title", {
                    _: "Create company tag",
                  })
                : translate("resources.company_tags.edit_title", {
                    _: "Edit company tag",
                  })
            }
            tag={editing === "new" ? { name: "", color: colors[0] } : editing}
            onSubmit={submit}
            onClose={() => setEditing(undefined)}
          />
        )}
      </CardContent>
    </Card>
  );
};
