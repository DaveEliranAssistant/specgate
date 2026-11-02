export function applyTextEdits(files, edits) {
  const sources = new Map(files.map((file) => [file.path, file.source]));
  for (const edit of edits) {
    const source = sources.get(edit.file);
    if (source == null) throw new Error(`Edit target is not in the fixture set: ${edit.file}`);
    const count = source.split(edit.find).length - 1;
    if (count !== edit.expectCount) {
      throw new Error(`Edit ${JSON.stringify(edit.find)} matched ${count} times in ${edit.file}, expected ${edit.expectCount}`);
    }
    sources.set(edit.file, source.split(edit.find).join(edit.replace));
  }
  return files.map((file) => ({ path: file.path, source: sources.get(file.path) }));
}
