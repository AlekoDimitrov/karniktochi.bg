-- Development catalog for the LOCAL database only: `npm run seed:dev` (wrangler d1 execute --local).
-- Replaces every product, variant and stock row (including the demo products) with 2 knives in three
-- lengths each (one length sold out) and 20 single-variant products. Orders are kept: their items are
-- snapshots, so they stay readable, but cancelling one no longer returns stock to a product removed here.

DELETE FROM stock;
DELETE FROM variants;
DELETE FROM products;

INSERT INTO products (id, name, brand, category, type, steel, blade_length_mm, handle, weight_g, summary, description, series, status, option_name, option_label, created_at, updated_at) VALUES
  ('gyuto-shibata-kotetsu', 'Гюто Шибата Котецу', 'Шибата', 'gotvarski', 'Гюто', 'Aogami Super', NULL, 'Магнолия, осмоъгълна', NULL,
   'Лек и много тънък готварски нож с остра режеща линия.', 'Ковано острие от Aogami Super, обковано с неръждаема стомана.
Подходящ за зеленчуци, месо и риба.', 'shibata-kotetsu', 'published', 'Length', 'Дължина', '2026-10-29T10:00:00Z', '2026-10-29T10:00:00Z'),
  ('petti-takamura-r2', 'Петти Такамура R2', 'Такамура', 'malki', 'Петти', 'R2 (SG2)', NULL, 'Микарта', NULL,
   'Малък универсален нож от прахова стомана.', 'Твърдо и устойчиво острие за дребна работа, белене и плодове.', '', 'published', 'Length', 'Дължина', '2026-10-29T09:00:00Z', '2026-10-29T09:00:00Z'),
  ('bunka-shibata-kotetsu-165-mm', 'Бунка Шибата Котецу 165 мм', 'Шибата', 'gotvarski', 'Бунка', 'Aogami Super', 165, 'Магнолия, осмоъгълна', 140,
   'Къс универсален нож с острие „нож-копие“.', 'Същото острие като гютото Котецу, в по-къса форма.', 'shibata-kotetsu', 'published', '', '', '2026-10-28T20:00:00Z', '2026-10-28T20:00:00Z'),
  ('santoku-todzhiro-dp-170-mm', 'Сантоку Тоджиро DP 170 мм', 'Тоджиро', 'gotvarski', 'Сантоку', 'VG-10', 170, 'Ламинирано дърво', 175,
   'Надежден сантоку за всеки ден.', 'Неръждаема стомана VG-10 с три слоя.', '', 'published', '', '', '2026-10-28T19:00:00Z', '2026-10-28T19:00:00Z'),
  ('nakiri-masakage-yuki-165-mm', 'Накири Масакаге Юки 165 мм', 'Масакаге', 'gotvarski', 'Накири', 'Shirogami #2', 165, 'Магнолия', 150,
   'Правоъгълен нож за зеленчуци.', 'Въглеродна стомана, нужда от грижа срещу ръжда.', 'masakage-yuki', 'published', '', '', '2026-10-28T18:00:00Z', '2026-10-28T18:00:00Z'),
  ('gyuto-misono-ux10-210-mm', 'Гюто Мисоно UX10 210 мм', 'Мисоно', 'gotvarski', 'Гюто', 'Шведска неръждаема', 210, 'Pakkawood', 180,
   'Класически професионален готварски нож.', 'Неръждаема стомана с отлична устойчивост.', '', 'published', '', '', '2026-10-28T17:00:00Z', '2026-10-28T17:00:00Z'),
  ('sudzhihiki-todzhiro-270-mm', 'Суджихики Тоджиро 270 мм', 'Тоджиро', 'gotvarski', 'Суджихики', 'VG-10', 270, 'Ламинирано дърво', 190,
   'Дълъг нож за филетиране и рязане на месо.', 'Тясно острие за чисти разрези с едно движение.', '', 'published', '', '', '2026-10-28T16:00:00Z', '2026-10-28T16:00:00Z'),
  ('gyuto-masakage-yuki-210-mm', 'Гюто Масакаге Юки 210 мм', 'Масакаге', 'gotvarski', 'Гюто', 'Shirogami #2', 210, 'Магнолия', 170,
   'Въглероден гюто с ръчно ковано острие.', 'Острие от Shirogami #2, обковано с мека стомана.', 'masakage-yuki', 'published', '', '', '2026-10-28T15:00:00Z', '2026-10-28T15:00:00Z'),
  ('petti-todzhiro-dp-120-mm', 'Петти Тоджиро DP 120 мм', 'Тоджиро', 'malki', 'Петти', 'VG-10', 120, 'Ламинирано дърво', 70,
   'Малък нож за белене и дребна работа.', 'Тънко острие от VG-10.', '', 'published', '', '', '2026-10-28T14:00:00Z', '2026-10-28T14:00:00Z'),
  ('belachka-misono-80-mm', 'Белачка Мисоно 80 мм', 'Мисоно', 'malki', 'Белачка', 'Шведска неръждаема', 80, 'Pakkawood', 50,
   'Къс нож за белене на плодове и зеленчуци.', 'Удобен в ръка, с точен връх.', '', 'published', '', '', '2026-10-28T13:00:00Z', '2026-10-28T13:00:00Z'),
  ('universalen-nozh-masakage-150-mm', 'Универсален нож Масакаге 150 мм', 'Масакаге', 'malki', 'Универсален', 'Shirogami #2', 150, 'Магнолия', 90,
   'Среден нож за всичко дребно.', 'Въглеродна стомана, лесна за заточване.', 'masakage-yuki', 'published', '', '', '2026-10-28T12:00:00Z', '2026-10-28T12:00:00Z'),
  ('honesuki-todzhiro-150-mm', 'Хонесуки Тоджиро 150 мм', 'Тоджиро', 'malki', 'Хонесуки', 'VG-10', 150, 'Ламинирано дърво', 120,
   'Нож за обезкостяване на птици.', 'Твърд триъгълен профил.', '', 'published', '', '', '2026-10-28T11:00:00Z', '2026-10-28T11:00:00Z'),
  ('kamak-shaptan-glas-1000', 'Камък Шаптън Глас #1000', 'Шаптън', 'kamani', 'Точилен камък', '', NULL, '', 450,
   'Среден камък за редовно заточване.', 'Бързо режещ, на стъклена основа.', 'shapton-glass', 'published', '', '', '2026-10-28T10:00:00Z', '2026-10-28T10:00:00Z'),
  ('kamak-shaptan-glas-3000', 'Камък Шаптън Глас #3000', 'Шаптън', 'kamani', 'Точилен камък', '', NULL, '', 450,
   'Фин камък за довършване.', 'Оставя гладък, остър ръб.', 'shapton-glass', 'published', '', '', '2026-10-28T09:00:00Z', '2026-10-28T09:00:00Z'),
  ('kamak-naniva-super-5000', 'Камък Нанива Супер #5000', 'Нанива', 'kamani', 'Точилен камък', '', NULL, '', 600,
   'Камък за полиране на ръба.', 'Изисква накисване преди употреба.', '', 'published', '', '', '2026-10-28T08:00:00Z', '2026-10-28T08:00:00Z'),
  ('kombiniran-kamak-king-1000-6000', 'Комбиниран камък Кинг #1000/#6000', 'Кинг', 'kamani', 'Точилен камък', '', NULL, '', 700,
   'Два камъка в един за начинаещи.', 'Груба и фина страна на една основа.', '', 'published', '', '', '2026-10-28T07:00:00Z', '2026-10-28T07:00:00Z'),
  ('izpravitel-za-kamani-atoma-140', 'Изправител за камъни Атома #140', 'Атома', 'kamani', 'Изправител', '', NULL, '', 300,
   'Диамантена плоча за изправяне на камъни.', 'Връща камъка в равнина след употреба.', '', 'published', '', '', '2026-10-28T06:00:00Z', '2026-10-28T06:00:00Z'),
  ('magnitna-stoyka-za-nozhove-40-sm', 'Магнитна стойка за ножове 40 см', 'Карник Точи', 'poddrazhka', 'Стойка', '', NULL, 'Орех', 600,
   'Стенна магнитна лента от орех.', 'Пази острието и държи ножовете под ръка.', '', 'published', '', '', '2026-10-28T05:00:00Z', '2026-10-28T05:00:00Z'),
  ('daska-za-ryazane-hasegava', 'Дъска за рязане Хасегава', 'Хасегава', 'poddrazhka', 'Дъска за рязане', '', NULL, '', 1200,
   'Мека дъска, която пази острието.', 'Хигиенична, лесна за почистване.', '', 'published', '', '', '2026-10-28T04:00:00Z', '2026-10-28T04:00:00Z'),
  ('maslo-ot-kamelia-100-ml', 'Масло от камелия 100 мл', 'Карник Точи', 'poddrazhka', 'Масло', '', NULL, '', 120,
   'Масло за защита на въглеродна стомана от ръжда.', 'Нанася се на тънък слой след измиване.', '', 'published', '', '', '2026-10-28T03:00:00Z', '2026-10-28T03:00:00Z'),
  ('kalaf-za-nozh-210-mm', 'Калъф за нож 210 мм', 'Карник Точи', 'poddrazhka', 'Калъф', '', NULL, 'Магнолия', 60,
   'Дървен калъф (сая) за гюто 210 мм.', 'Пази острието при пренасяне.', '', 'published', '', '', '2026-10-28T02:00:00Z', '2026-10-28T02:00:00Z'),
  ('rolka-za-nozhove-misono', 'Ролка за ножове Мисоно', 'Мисоно', 'poddrazhka', 'Ролка', '', NULL, '', 400,
   'Платнена ролка за шест ножа.', 'За пренасяне до работа или курс.', '', 'published', '', '', '2026-10-28T01:00:00Z', '2026-10-28T01:00:00Z');

-- Variant ids in the v_ + 12 hex format the catalog creates.
INSERT INTO variants (id, product_id, position, option_value, option_key, sku, price_cents) VALUES
  ('v_5eed00000101', 'gyuto-shibata-kotetsu', 0, '210 мм', '210-mm', 'SHI-KOT-210', 18900),
  ('v_5eed00000102', 'gyuto-shibata-kotetsu', 1, '240 мм', '240-mm', 'SHI-KOT-240', 21900),
  ('v_5eed00000103', 'gyuto-shibata-kotetsu', 2, '270 мм', '270-mm', 'SHI-KOT-270', 25900),
  ('v_5eed00000201', 'petti-takamura-r2', 0, '130 мм', '130-mm', 'TAK-R2-130', 11900),
  ('v_5eed00000202', 'petti-takamura-r2', 1, '150 мм', '150-mm', 'TAK-R2-150', 13900),
  ('v_5eed00000203', 'petti-takamura-r2', 2, '170 мм', '170-mm', 'TAK-R2-170', 15900),
  ('v_5eed00000301', 'bunka-shibata-kotetsu-165-mm', 0, '', '', NULL, 17900),
  ('v_5eed00000302', 'santoku-todzhiro-dp-170-mm', 0, '', '', NULL, 9800),
  ('v_5eed00000303', 'nakiri-masakage-yuki-165-mm', 0, '', '', NULL, 14500),
  ('v_5eed00000304', 'gyuto-misono-ux10-210-mm', 0, '', '', NULL, 16900),
  ('v_5eed00000305', 'sudzhihiki-todzhiro-270-mm', 0, '', '', NULL, 15500),
  ('v_5eed00000306', 'gyuto-masakage-yuki-210-mm', 0, '', '', NULL, 17500),
  ('v_5eed00000307', 'petti-todzhiro-dp-120-mm', 0, '', '', NULL, 6400),
  ('v_5eed00000308', 'belachka-misono-80-mm', 0, '', '', NULL, 5200),
  ('v_5eed00000309', 'universalen-nozh-masakage-150-mm', 0, '', '', NULL, 9900),
  ('v_5eed00000310', 'honesuki-todzhiro-150-mm', 0, '', '', NULL, 8900),
  ('v_5eed00000311', 'kamak-shaptan-glas-1000', 0, '', '', NULL, 6900),
  ('v_5eed00000312', 'kamak-shaptan-glas-3000', 0, '', '', NULL, 8500),
  ('v_5eed00000313', 'kamak-naniva-super-5000', 0, '', '', NULL, 7900),
  ('v_5eed00000314', 'kombiniran-kamak-king-1000-6000', 0, '', '', NULL, 4500),
  ('v_5eed00000315', 'izpravitel-za-kamani-atoma-140', 0, '', '', NULL, 9500),
  ('v_5eed00000316', 'magnitna-stoyka-za-nozhove-40-sm', 0, '', '', NULL, 5900),
  ('v_5eed00000317', 'daska-za-ryazane-hasegava', 0, '', '', NULL, 8900),
  ('v_5eed00000318', 'maslo-ot-kamelia-100-ml', 0, '', '', NULL, 1500),
  ('v_5eed00000319', 'kalaf-za-nozh-210-mm', 0, '', '', NULL, 3500),
  ('v_5eed00000320', 'rolka-za-nozhove-misono', 0, '', '', NULL, 7500);

-- Gyuto: 210 in stock, 240 last one, 270 sold out. Petty: 130 plenty, 150 sold out, 170 two left.
-- Among the single products the #3000 stone is sold out.
INSERT INTO stock (variant_id, quantity) VALUES
  ('v_5eed00000101', 4), ('v_5eed00000102', 1), ('v_5eed00000103', 0),
  ('v_5eed00000201', 6), ('v_5eed00000202', 0), ('v_5eed00000203', 2),
  ('v_5eed00000301', 3), ('v_5eed00000302', 8), ('v_5eed00000303', 2), ('v_5eed00000304', 5),
  ('v_5eed00000305', 1), ('v_5eed00000306', 2), ('v_5eed00000307', 7), ('v_5eed00000308', 9),
  ('v_5eed00000309', 4), ('v_5eed00000310', 3), ('v_5eed00000311', 6), ('v_5eed00000312', 0),
  ('v_5eed00000313', 2), ('v_5eed00000314', 10), ('v_5eed00000315', 2), ('v_5eed00000316', 5),
  ('v_5eed00000317', 3), ('v_5eed00000318', 20), ('v_5eed00000319', 6), ('v_5eed00000320', 2);
