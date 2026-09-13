export const cn = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter((c): c is string => Boolean(c)).join(" ");