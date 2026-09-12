type NutritionChipProps = {
  label: string;
};

export function NutritionChip({ label }: NutritionChipProps) {
  return <span className="food-chip">{label}</span>;
}
