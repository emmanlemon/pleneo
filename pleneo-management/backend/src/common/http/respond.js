export const ok = (res, payload) => res.status(200).json(payload);
export const created = (res, payload) => res.status(201).json(payload);
export const accepted = (res, message) => res.status(202).json({ message });
export const noContent = (res) => res.status(204).end();
