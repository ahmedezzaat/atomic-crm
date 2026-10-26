import { useRecordContext } from "ra-core";
import { ReferenceArrayField } from "@/components/admin/reference-array-field";
import { SingleFieldList } from "@/components/admin/single-field-list";
import { Badge } from "@/components/ui/badge";

const TagBadge = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Badge
      variant="outline"
      className="text-black font-normal"
      style={{ backgroundColor: record.color, border: 0 }}
    >
      {record.name}
    </Badge>
  );
};

export const CompanyTagsList = () => (
  <ReferenceArrayField
    className="inline-block"
    resource="companies"
    source="tags"
    reference="company_tags"
  >
    <SingleFieldList>
      <TagBadge />
    </SingleFieldList>
  </ReferenceArrayField>
);
