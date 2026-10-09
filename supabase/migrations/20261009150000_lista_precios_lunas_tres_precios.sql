-- Lista oficial de precios de lunas (Shuyana y equipo, 2026-10-09), para Shuvision y Focus.
-- Cada luna tiene 3 precios:
--   precio_venta    = Precio Mayor (el de catálogo, el más alto del rango)
--   precio_venta_2  = Precio Menor (el mínimo recomendado para vender)
--   precio_convenio = Precio Convenio (Menor + 8 %, para pacientes de convenio por descuento a rol)
-- Las lunas anteriores se desactivan (no se borran: siguen ligadas a ventas y órdenes viejas).

alter table public.productos_catalogo add column if not exists precio_convenio numeric;
comment on column public.productos_catalogo.precio_convenio is 'Precio para pacientes de convenio (descuento a rol). En lunas: Precio Menor + 8 %.';

update public.productos_catalogo
set activo = false, actualizado_en = now()
where categoria = 'lente' and activo and coalesce(codigo, '') not like 'LP-%'
  and empresa_id in (select id from public.empresas where nombre in ('Shuvisión', 'Focus'));


-- Datos: n|opción (si el nombre se repite)|Diseño|Línea|Material|Índice|Tecnología|Costo|Mayor|Menor|Convenio
insert into public.productos_catalogo
  (empresa_id, codigo, nombre, categoria, clasificacion, diseno, linea, material, indice, tecnologia, costo_referencial, precio_venta, precio_venta_2, precio_convenio, controla_inventario, activo)
select e.id, 'LP-' || lpad(p[1], 3, '0'),
  regexp_replace(upper(concat_ws(' ', nullif(p[3], ''), nullif(p[4], ''), nullif(p[5], ''), nullif(p[7], ''))), '\s+', ' ', 'g')
    || case when p[6] <> '' then ' INDICE ' || p[6] else '' end
    || case when p[2] <> '0' then ' (OPCIÓN ' || p[2] || ')' else '' end,
  'lente', p[3], p[3], upper(p[4]), nullif(p[5], ''), nullif(p[6], '')::numeric, nullif(p[7], ''),
  nullif(p[8], '')::numeric, p[9]::numeric, p[10]::numeric, p[11]::numeric, false, true
from public.empresas e
cross join (select string_to_array(linea, '|') as p from regexp_split_to_table($datos$
1|0|Monofocal|Terminado|CR39|1.49|BLANCO|8.26|30|25|27
2|0|Monofocal|Terminado|CR39|1.49|POLARIZADO CAFE/VERDE neutro|16|90|80|86.5
3|0|Monofocal|Terminado|CR39|1.49|POLARIZADO ESPEJADO (VARIOCOLOR) neutro|20|100|90|97.5
4|0|Monofocal|Terminado|CR39|1.56|AR|11|40|35|38
5|0|Monofocal|Terminado|CR39|1.56|AR + FLA|14.82|80|70|76
6|0|Monofocal|Terminado|CR39|1.56|FOTOCROMATICO + AR|24.25|120|110|119
7|0|Monofocal|Terminado|CR39|1.56|FOTOCROMATICO + AR + FLA|30|150|145|157
8|0|Monofocal|Terminado|CR39|1.56|TINTURADO|12.75|70|60|65
9|0|Monofocal|Terminado|GX7|1.60|AR|19|100|90|97.5
10|0|Monofocal|Terminado|GX7|1.60|AR + FLA|34.5|150|130|140.5
11|0|Monofocal|Terminado|GX7|1.60|FOTOCROMATICO + AR|23|200|180|194.5
12|0|Monofocal|Terminado|GX7|1.60|FOTOCROMATICO + AR +FLA|80|250|230|248.5
13|0|Monofocal|Terminado|Policarbonato|1.59|AR|14.82|80|70|76
14|0|Monofocal|Terminado|Policarbonato|1.59|AR + FLA|24.25|120|100|108
15|0|Monofocal|Terminado|Policarbonato|1.59|BLANCO|13.9|70|60|65
16|0|Monofocal|Terminado|Policarbonato|1.59|FLA + AR GOLD|20|180|160|173
17|0|Monofocal|Terminado|Policarbonato|1.59|FOTOCROMATICO + AR|34.6|160|140|151.5
18|0|Monofocal|Terminado|Policarbonato|1.59|FOTOCROMATICO + AR + FLA|43.8|200|190|205.5
19|1|Bifocal|Terminado|CR39|1.49|Blanco|3.5|65|45|49
20|2|Bifocal|Terminado|CR39|1.49|Blanco|3.2|55|35|38
21|1|Bifocal|Terminado|Reducción|1.56|Antirreflejo verde|7|77|57|62
22|2|Bifocal|Terminado|Reducción|1.56|Antirreflejo verde|7|67|47|51
23|1|Bifocal|Terminado|Reducción|1.56|Filtro azul antirreflejo azul|21|105|85|92
24|2|Bifocal|Terminado|Reducción|1.56|Filtro azul antirreflejo azul|21|115|95|103
25|1|Bifocal|Terminado|Reducción|1.56|Fotocromático gris capa antirraya|19|160|140|151.5
26|2|Bifocal|Terminado|Reducción|1.56|Fotocromático gris capa antirraya|19|150|130|140.5
27|1|Bifocal|Terminado|Reducción|1.56|Fotocromático gris antirreflejo verde|21|140|120|130
28|2|Bifocal|Terminado|Reducción|1.56|Fotocromático gris antirreflejo verde|21|130|110|119
29|0|Progresivo|Terminado|CR39|1.56|BLANCO|18.15|100|70|76
30|0|Progresivo|Terminado|CR39|1.56|AR|25|120|90|97.5
31|0|Progresivo|Terminado|CR39|1.56|AR + FLA|32.3|140|110|119
32|0|Progresivo|Terminado|CR39|1.56|FOTOCROMATICO + AR|31.15|160|130|140.5
33|0|Progresivo|Terminado|CR38|1.56|FOTOCROMATICO + AR + FLA|41.5|180|150|162
34|0|Progresivo|Terminado|Policarbonato|1.59|BLANCO|25|130|100|108
35|0|Progresivo|Terminado|Policarbonato|1.59|AR|35.75|150|120|130
36|0|Progresivo|Terminado|Policarbonato|1.59|AR + FLA|41.5|170|140|151.5
37|0|Progresivo|Terminado|Policarbonato|1.59|FOTOCROMATICO + AR|53|190|160|173
38|0|Progresivo|Terminado|Policarbonato|1.59|FOTOCROMATICO + AR + FLA|64.5|220|190|205.5
39|0|Bifocal|Terminado|Reducción (Mid Index)|1.56|Bifocal Flap Top Foto + Blue Raycut con AR|29.3|207|177|191.5
40|0|Monofocal|Terminado|CR39|1.49|Transitions Orma Gris con AR|52.3|236|206|222.5
41|0|Monofocal|Terminado|CR39|1.49|Transitions Orma Gris|41.95|194|164|177.5
42|0|Monofocal|Terminado|Policarbonato|1.59|Transitions Airwear Gris con AR|69.55|305|275|297
43|0|Monofocal|Terminado|Policarbonato|1.59|Transitions Airwear Gris|59.2|246|216|233.5
44|0|Monofocal|Terminado|Policarbonato|1.59|Transitions Airwear Café con AR|69.55|305|275|297
45|1|Monofocal|Terminado|Reducción (Mid Index)|1.57|FutureX|26.42|192|162|175
46|0|Monofocal|Terminado|Reducción (Mid Index)|1.56|Vixon Foto + Blue Raycut con AR|24.7|184|154|166.5
47|0|Monofocal|Terminado|Reducción (Mid Index)|1.56|Vixon Foto + Blue Raycut con AR Cil Ext|28.15|201|171|185
48|0|Progresivo|Terminado|Policarbonato|1.59|Prog Poli Vixon Blue Raycut con AR|24.7|184|154|166.5
49|0|Bifocal|Terminado|Reducción (Mid Index)|1.56|Bif FT Mid Index Vixon Blue Raycut con AR|17.8|149|119|129
50|0|Bifocal|Terminado|Policarbonato|1.59|Bif Inv Poli Vixon Blue Raycut con AR|21.25|167|137|148
51|0|Monofocal|Terminado|Reducción (Mid Index)|1.56|Kodak Lens Blue|13.2|172|142|153.5
52|0|Monofocal|Terminado|Policarbonato|1.59|Kodak City Lens|18.95|184|154|166.5
53|0|Monofocal|Terminado|Policarbonato|1.59|Crizal Rock|45.4|235|205|221.5
54|2|Monofocal|Terminado|Reducción (Mid Index)|1.57|FutureX|17.8|184|154|166.5
55|0|Monofocal|Terminado|Reducción (Hi Index)|1.60|Clex Blue Raycut con AR|17.8|184|154|166.5
56|0|Monofocal|Terminado|Reducción (Mid Index)|1.56|VS Mid Index Vixon Blue Raycut con AR|9.75|155|125|135
57|0|Monofocal|Terminado|Policarbonato|1.59|VS Poli Vixon Blue Raycut con AR|15.27|160|130|140.5
58|0|Monofocal|Terminado|Policarbonato|1.59|VS Poli Vixon Blue Raycut con AR Rango Ext|21.25|167|137|148
59|0|Monofocal|Terminado|Reducción (Hi Index)|1.60|VS Ultravex Vixon Blue Raycut con AR|17.8|194|164|177.5
60|0|Monofocal|Terminado|Reducción (Hi Index)|1.67|VS Alto Índice Vixon Blue Raycut con AR|38.5|253|223|241
61|0|Progresivo|Terminado|CR39|1.49|Prog CR39 con AR|17.8|155|125|135
62|3|Monofocal|Terminado|Reducción (Mid Index)|1.57|FutureX|12.28|138|108|117
63|0|Monofocal|Terminado|CR39|1.49|VS Plástico con AR|7.22|115|85|92
64|0|Monofocal|Terminado|CR39|1.49|VS Plástico con AR Cilindro Ext|12.62|115|85|92
65|0|Monofocal|Terminado|Reducción (Mid Index)|1.56|VS Clex Mid Index con AR|9.18|132|102|110.5
66|0|Monofocal|Terminado|Reducción (Mid Index)|1.56|VS Clex Mid Index con AR Rango Ext|12.62|138|108|117
67|0|Monofocal|Terminado|Policarbonato|1.59|VS Poli con AR|11.13|149|119|129
68|0|Monofocal|Terminado|Policarbonato|1.59|VS Poli con AR Rango Ext|17.8|155|125|135
69|0|Monofocal|Terminado|Reducción (Hi Index)|1.67|VS Alto Índice Vixon con AR|29.3|207|177|191.5
70|0|Progresivo|Terminado|CR39|1.49|Prog CR39 Blanco|14.35|144|114|123.5
71|0|Bifocal|Terminado|CR39|1.49|Bif Inv CR39 Blanco|7.22|138|108|117
72|0|Bifocal|Terminado|CR39|1.49|Bif FT CR39 Blanco|6.88|132|102|110.5
73|0|Monofocal|Terminado|CR39|1.49|VS Plástico Blanco|5.04|115|85|92
74|0|Monofocal|Terminado|CR39|1.49|VS Plástico Blanco Cilindro Ext|7.22|121|91|98.5
75|0|Monofocal|Terminado|Reducción (Mid Index)|1.56|VS Clex Mid Index Blanco|8.37|132|102|110.5
76|0|Monofocal|Terminado|Policarbonato|1.59|VS Poli Blanco|8.83|138|108|117
77|1|Bifocal|Tallado Convencional|CR39|1.49|Blanco|14.6|110|90|97.5
78|2|Bifocal|Tallado Convencional|CR39|1.49|Blanco|14.6|100|80|86.5
79|1|Bifocal|Tallado Convencional|Policarbonato|1.59|Blanco|33.6|150|130|140.5
80|2|Bifocal|Tallado Convencional|Policarbonato|1.59|Blanco|33.6|140|120|130
81|1|Bifocal|Tallado Convencional|Reducción|1.56|Antirreflejo verde|21|120|100|108
82|2|Bifocal|Tallado Convencional|Reducción|1.56|Antirreflejo verde|21|110|90|97.5
83|1|Bifocal|Tallado Convencional|Policarbonato|1.59|Antirreflejo verde|37|160|140|151.5
84|2|Bifocal|Tallado Convencional|Policarbonato|1.59|Antirreflejo verde|37|150|130|140.5
85|1|Bifocal|Tallado Convencional|Reducción|1.56|Filtro azul antirreflejo azul|34|150|130|140.5
86|2|Bifocal|Tallado Convencional|Reducción|1.56|Filtro azul antirreflejo azul|34|140|120|130
87|1|Bifocal|Tallado Convencional|Policarbonato|1.59|Filtro azul antirreflejo azul|41|180|160|173
88|2|Bifocal|Tallado Convencional|Policarbonato|1.59|Filtro azul antirreflejo azul|41|170|150|162
89|1|Bifocal|Tallado Convencional|Reducción|1.56|Fotocromático gris antirreflejo verde|39|170|150|162
90|2|Bifocal|Tallado Convencional|Reducción|1.56|Fotocromático gris antirreflejo verde|39|160|140|151.5
91|1|Bifocal|Tallado Convencional|Reducción|1.56|Fotocromático gris filtro azul antirreflejo azul|50|220|200|216
92|2|Bifocal|Tallado Convencional|Reducción|1.56|Fotocromático gris filtro azul antirreflejo azul|50|210|190|205.5
93|0|Progresivo|Tallado Convencional|CR39|1.49|Ovation (CR39 GEN S)|113.25|408|378|408.5
94|0|Progresivo|Tallado Convencional|Policarbonato|1.59|Ovation (Poly GEN S)|124.75|443|413|446.5
95|0|Progresivo|Tallado Convencional|CR39|1.49|Ovation (CR39 (Blancos))|47.7|212|182|197
96|0|Progresivo|Tallado Convencional|Policarbonato|1.59|Ovation (Poly (Blancos))|50|193|163|176.5
97|0|Progresivo|Tallado Convencional|CR39|1.49|Natural (CR39 GEN S)|105.2|384|354|382.5
98|0|Progresivo|Tallado Convencional|Policarbonato|1.59|Natural (Poly GEN S)|113.25|408|378|408.5
99|0|Progresivo|Tallado Convencional|CR39|1.49|Natural (CR39 (Blancos))|38.5|184|154|166.5
100|0|Progresivo|Tallado Convencional|Policarbonato|1.59|Natural (Poly (Blancos))|38.5|190|160|173
101|0|Progresivo|Tallado Convencional|CR39|1.49|Hoya (CR39 (Blancos))|24.7|149|119|129
102|0|Progresivo|Tallado Convencional|Policarbonato|1.59|Hoya (Poly (Blancos))|31.6|172|142|153.5
103|0|Progresivo|Tallado Convencional|Policarbonato|1.59|Vixon (Poly Blue Raycut)|36.2|177|147|159
104|0|Progresivo|Tallado Convencional|Reducción (Mid Index)|1.56|Vixon (Mid Index Foto)|45.4|205|175|189
105|0|Progresivo|Tallado Convencional|Reducción (Mid Index)|1.56|Vixon (Mid Index Blue Raycut)|52.3|225|195|211
106|0|Bifocal|Tallado Convencional|Policarbonato|1.59|Bifocal Invisible (Poly Blue Raycut)|36.2|186|156|168.5
107|0|Bifocal|Tallado Convencional|Reducción (Mid Index)|1.56|Bifocal Invisible (Mid Index Foto)|45.4|195|165|178.5
108|0|Bifocal|Tallado Convencional|Policarbonato|1.59|Bifocal Invisible (Poly Foto)|50|241|211|228
109|0|Bifocal|Tallado Convencional|Reducción (Mid Index)|1.56|Bifocal Invisible (Mid Index Blue Raycut (Foto))|52.3|241|211|228
110|0|Bifocal|Tallado Convencional|CR39|1.49|Bifocal Invisible (CR39 (Blancos))|21.25|139|109|118
111|0|Bifocal|Tallado Convencional|Policarbonato|1.59|Bifocal Invisible (Poly (Blancos))|28.15|172|142|153.5
112|0|Bifocal|Tallado Convencional|Reducción (Mid Index)|1.56|Bifocal Flap Top (Mid Index Blue Raycut)|24.7|148|118|127.5
113|0|Bifocal|Tallado Convencional|CR39|1.49|Bifocal Flap Top (CR39 GEN S)|84.5|260|230|248.5
114|0|Bifocal|Tallado Convencional|Reducción (Mid Index)|1.56|Bifocal Flap Top (Mid Index Foto)|43.1|170|140|151.5
115|0|Bifocal|Tallado Convencional|Policarbonato|1.59|Bifocal Flap Top (Poly Foto)|70.7|235|205|221.5
116|0|Bifocal|Tallado Convencional|Reducción (Mid Index)|1.56|Bifocal Flap Top (Mid Index Blue Raycut (Foto))|48.85|235|205|221.5
117|0|Bifocal|Tallado Convencional|CR39|1.49|Bifocal Flap Top (CR39 (Blancos))|18.95|129|99|107
118|0|Bifocal|Tallado Convencional|Policarbonato|1.59|Bifocal Flap Top (Poly (Blancos))|24.7|170|140|151.5
119|0|Monofocal|Tallado Convencional|Policarbonato|1.59|Poly Blue Raycut|32.75|166|136|147
120|0|Monofocal|Tallado Convencional|Alto Índice (Resina)|1.67|T&L Blue Raycut|61.5|222|192|207.5
121|0|Monofocal|Tallado Convencional|CR39|1.49|CR39 GEN S|63.8|283|253|273.5
122|0|Monofocal|Tallado Convencional|Policarbonato|1.59|Poly GEN S|79.9|368|338|365.5
123|0|Monofocal|Tallado Convencional|Policarbonato|1.59|Poly Xtractive New Gen|79.9|368|338|365.5
124|0|Monofocal|Tallado Convencional|Policarbonato|1.59|Poly Xtractive Polarized|119|448|418|451.5
125|0|Monofocal|Tallado Convencional|Alto Índice (Resina)|1.67|T&L GEN S|107.5|412|382|413
126|0|Monofocal|Tallado Convencional|CR39|1.49|CR39 Foto|43.1|175|145|157
127|0|Monofocal|Tallado Convencional|Policarbonato|1.59|Poly Foto|59.2|216|186|201
128|0|Monofocal|Tallado Convencional|Reducción (Mid Index)|1.56|Mid Index Drive Relax|47.7|195|165|178.5
129|0|Monofocal|Tallado Convencional|Reducción (Mid Index)|1.56|Mid Index Blue Raycut|47.7|225|195|211
130|0|Monofocal|Tallado Convencional|Reducción (Hi Index)|1.60|Hi Index Blue Raycut|61.5|270|240|259.5
131|0|Monofocal|Tallado Convencional|Policarbonato|1.59|Poly Xperio Gris|55.75|258|228|246.5
132|0|Monofocal|Tallado Convencional|Policarbonato|1.59|Poly Xperio Café|77.6|316|286|309
133|0|Monofocal|Tallado Convencional|CR39|1.49|CR39 Xperio|96|375|345|373
134|0|Monofocal|Tallado Convencional|CR39|1.49|CR39|16.65|131|101|109.5
135|0|Monofocal|Tallado Convencional|Policarbonato|1.59|Poly|27|158|128|138.5
136|0|Monofocal|Tallado Convencional|Reducción (Hi Index)|1.60|High Index|32.75|158|128|138.5
137|0|Monofocal|Tallado Convencional|Alto Índice (Resina)|1.67|T&L|59.2|216|186|201
138|0|Monofocal|Digital|CR39|1.56|DRIVE RELAX+ AR PLUS|108.6|230|200|216
139|0|Monofocal|Digital|Policarbonato|1.59|TRANSITION GS|145|380|360|389
140|0|Monofocal|Digital|Policarbonato|1.59|TRANSITION GS + AR PLUS|168|410|390|421.5
141|0|Monofocal|Digital|Policarbonato|1.59|XPERIO GRIS|145|250|220|238
142|0|Monofocal|Digital|Reducción (Hi Index)|1.60|FOTO BLUE RAYCUT + AR SH|95|270|250|270
143|0|Monofocal|Digital|CR39|1.56|FOTOCROMATICO|70.25|220|200|216
144|0|Monofocal|Digital|CR39|1.56|FOTOCROMATICO + AR|85.2|260|250|270
145|0|Monofocal|Digital|CR39|1.56|FOTOCROMATICO + AR + FLA|99|300|290|313.5
146|0|Monofocal|Digital|CR39|1.56|TRANSITION GS|122|350|340|367.5
147|0|Monofocal|Digital|CR39|1.56|TRANSITION GS + AR|122|380|370|400
148|0|Monofocal|Digital|CR39|1.61|AR|104.75|320|300|324
149|0|Monofocal|Digital|CR39|1.61|AR + FLA|87.5|360|340|367.5
150|0|Monofocal|Digital|CR39|1.61|BLANCO|89.8|280|270|292
151|0|Monofocal|Digital|CR39|1.61|FLA|74.85|340|320|346
152|0|Monofocal|Digital|CR39|1.61|FOTOCROMATICO + AR + FLA|145|420|400|432
153|0|Monofocal|Digital|CR39|1.67|AR|104.75|340|330|356.5
154|0|Monofocal|Digital|CR39|1.67|AR + FLA|116.25|370|360|389
155|0|Monofocal|Digital|CR39|1.67|BLANCO|89.8|300|280|302.5
156|0|Monofocal|Digital|CR39|1.67|FLA|107.75|350|340|367.5
157|0|Monofocal|Digital|CR39|1.67|Transition gen s|113.95|420|400|432
158|0|Monofocal|Digital|CR39|1.67|FOTOCROMATICO + AR|101.3|380|360|389
159|0|Monofocal|Digital|CR39|1.74|AR|145|430|400|432
160|0|Monofocal|Digital|CR39|1.74|BLANCO|133.5|400|380|410.5
161|0|Monofocal|Digital|CR39|1.74|FLA|150.75|450|430|464.5
162|0|Monofocal|Digital|Policarbonato|1.59|AR|80.6|290|270|292
163|0|Monofocal|Digital|Policarbonato|1.59|AR + FLA|96.7|320|300|324
164|0|Monofocal|Digital|Policarbonato|1.59|BLANCO|59.9|270|250|270
165|0|Monofocal|Digital|Policarbonato|1.59|EYEZEN START + TRANSITION GEN S|150|380|350|378
166|0|Monofocal|Digital|Policarbonato|1.59|EYEZEN START + TRANSITION GEN S + CRIZAL|150|480|450|486
167|0|Monofocal|Digital|Policarbonato|1.67|EYEZEN START + TRANSITION GEN S|80.6|550|500|540
168|0|Monofocal|Digital|Policarbonato|1.67|EYEZEN START + TRANSITION GEN S + CRIZAL|116.25|650|600|648
169|0|Monofocal|Digital|Policarbonato|1.59|KODAK TRANSITION EXTRACTIVE|100|320|300|324
170|0|Monofocal|Digital|Policarbonato|1.59|KODAK TRANSITION EXTRACTIVE polarized|131.2|420|400|432
171|0|Monofocal|Digital|Policarbonato/CR39|1.56|OXO Fotosensible Color (Pink/Purple/Verde/AZUL)|75|200|180|194.5
172|0|Progresivo|Digital|Policarbonato|1.59|Varilux XR design + Crizal (Airwear (Blancos))|221.35|554|524|566
173|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux XR design + Crizal (T&L (Blancos))|257|733|703|759.5
174|0|Progresivo|Digital|Policarbonato|1.59|Varilux XR design + Crizal (Airwear GEN S (Transitions))|326|1046|1016|1097.5
175|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux XR design + Crizal (T&L GEN S (Transitions))|343.25|1098|1068|1153.5
176|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio extensee + Crizal (Airwear (Blancos))|178.8|605|575|621
177|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Physio extensee + Crizal (T&L (Blancos))|193.75|650|620|670
178|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio extensee + Crizal (Airwear GEN S colores (Transitions))|245.5|791|761|822
179|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Physio extensee + Crizal (T&L GEN S (Transitions))|281.15|912|882|953
180|0|Progresivo|Digital|||Antirreflejo Superhidrofóbico (Complemento)|38.5|149|119|129
181|0|Progresivo|Digital|||Antirreflejo Star Plus (Complemento)|27|138|108|117
182|0|Progresivo|Digital|||Antirreflejo Luz Azul por Reflexión (Complemento)|20.1|115|85|92
183|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio 3.0 DRx (Airwear BlueUV)|137.4|520|490|529.5
184|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Physio 3.0 DRx (T&L BlueUV)|147.75|554|524|566
185|0|Progresivo|Digital|CR39|1.49|Varilux Physio 3.0 DRx (Orma GEN S)|178.8|655|625|675
186|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio 3.0 DRx (Airwear GEN S)|199.5|724|694|750
187|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio 3.0 DRx (Airwear Xtractive New Gen)|199.5|724|694|750
188|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio 3.0 DRx (Airwear Xtractive Polarized)|231.7|831|801|865.5
189|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Physio 3.0 DRx (T&L GEN S)|239.75|858|828|894.5
190|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio 3.0 DRx (Airwear Xperio Gris)|176.5|650|620|670
191|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio 3.0 DRx (Airwear Xperio Café)|199.5|726|696|752
192|0|Progresivo|Digital|CR39|1.49|Varilux Physio 3.0 DRx (Orma)|119|460|430|464.5
193|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio 3.0 DRx (Airwear)|124.75|478|448|484
194|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Physio 3.0 DRx (T&L)|142|536|506|546.5
195|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio DRx (Airwear BlueUV)|120.15|429|399|431
196|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Physio DRx (T&L BlueUV)|136.25|516|486|525
197|0|Progresivo|Digital|CR39|1.49|Varilux Physio DRx (Orma GEN S)|167.3|619|589|636.5
198|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio DRx (Airwear GEN S)|188|688|658|711
199|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio DRx (Airwear Xtractive New Gen)|188|688|658|711
200|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio DRx (Airwear Xtractive Polarized)|222.5|802|772|834
201|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Physio DRx (T&L GEN S)|211|764|734|793
202|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio DRx (Airwear Xperio Gris)|147.75|554|524|566
203|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio DRx (Airwear Xperio Café)|161.55|600|570|616
204|0|Progresivo|Digital|CR39|1.49|Varilux Physio DRx (Orma Xperio)|188|688|658|711
205|0|Progresivo|Digital|CR39|1.49|Varilux Physio DRx (Orma)|101.75|402|372|402
206|0|Progresivo|Digital|Policarbonato|1.59|Varilux Physio DRx (Airwear)|113.25|440|410|443
207|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Physio DRx (T&L)|130.5|498|468|505.5
208|0|Progresivo|Digital|Policarbonato|1.59|Varilux Comfort Max (Airwear BlueUV)|91.4|368|338|365.5
209|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Comfort Max (T&L BlueUV)|113.25|440|410|443
210|0|Progresivo|Digital|CR39|1.49|Varilux Comfort Max (Orma GEN S)|165|612|582|629
211|0|Progresivo|Digital|Policarbonato|1.59|Varilux Comfort Max (Airwear GEN S)|170.75|630|600|648
212|0|Progresivo|Digital|Policarbonato|1.59|Varilux Comfort Max (Airwear Xtractive New Gen)|170.75|630|600|648
213|0|Progresivo|Digital|Policarbonato|1.59|Varilux Comfort Max (Airwear Xtractive Polarized)|205.25|744|714|771.5
214|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Comfort Max (T&L GEN S)|182.25|668|638|689.5
215|0|Progresivo|Digital|Policarbonato|1.59|Varilux Comfort Max (Airwear Xperio Gris)|119|460|430|464.5
216|0|Progresivo|Digital|Policarbonato|1.59|Varilux Comfort Max (Airwear Xperio Café)|132.8|505|475|513
217|0|Progresivo|Digital|CR39|1.49|Varilux Comfort Max (Orma Xperio)|159.25|592|562|607
218|0|Progresivo|Digital|CR39|1.49|Varilux Comfort Max (Orma)|78.75|327|297|321
219|0|Progresivo|Digital|Policarbonato|1.59|Varilux Comfort Max (Airwear)|84.5|346|316|341.5
220|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Varilux Comfort Max (T&L)|107.5|422|392|423.5
221|0|Progresivo|Digital|Policarbonato|1.59|Ovation DS (Airwear BlueUV)|61.5|279|249|269
222|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Ovation DS (T&L BlueUV)|104.05|400|370|400
223|0|Progresivo|Digital|CR39|1.49|Ovation DS (Orma GEN S)|130.5|522|492|531.5
224|0|Progresivo|Digital|Policarbonato|1.59|Ovation DS (Airwear GEN S)|142|566|536|579
225|0|Progresivo|Digital|Policarbonato|1.59|Ovation DS (Airwear Xtractive New Gen)|142|566|536|579
226|0|Progresivo|Digital|Policarbonato|1.59|Ovation DS (Airwear Xtractive Polarized)|182.25|615|585|632
227|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Ovation DS (T&L GEN S)|162.7|669|639|690.5
228|0|Progresivo|Digital|Policarbonato|1.59|Ovation DS (Airwear Xperio Gris)|100.6|397|367|396.5
229|0|Progresivo|Digital|Policarbonato|1.59|Ovation DS (Airwear Xperio Café)|102.9|463|433|468
230|0|Progresivo|Digital|CR39|1.49|Ovation DS (Orma Xperio)|140.85|519|489|528.5
231|0|Progresivo|Digital|CR39|1.49|Ovation DS (Orma)|50|246|216|233.5
232|0|Progresivo|Digital|Policarbonato|1.59|Ovation DS (Airwear)|52.3|264|234|253
233|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Ovation DS (T&L)|98.3|393|363|392.5
234|0|Progresivo|Digital|Policarbonato|1.59|Natural DS (Airwear BlueUV)|50|250|220|238
235|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Natural DS (T&L BlueUV)|90.25|356|326|352.5
236|0|Progresivo|Digital|CR39|1.49|Natural DS (Orma GEN S)|113.25|482|452|488.5
237|0|Progresivo|Digital|Policarbonato|1.59|Natural DS (Airwear GEN S)|124.75|515|485|524
238|0|Progresivo|Digital|Policarbonato|1.59|Natural DS (Airwear Xtractive New Gen)|124.75|483|453|489.5
239|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Natural DS (T&L GEN S)|142|552|522|564
240|0|Progresivo|Digital|Policarbonato|1.59|Natural DS (Airwear Xperio Gris)|84.5|382|352|380.5
241|0|Progresivo|Digital|Policarbonato|1.59|Natural DS (Airwear Xperio Café)|86.8|393|363|392.5
242|0|Progresivo|Digital|CR39|1.49|Natural DS (Orma Xperio)|124.75|467|437|472
243|0|Progresivo|Digital|CR39|1.49|Natural DS (Orma)|41.95|213|183|198
244|0|Progresivo|Digital|Policarbonato|1.59|Natural DS (Airwear)|44.25|221|191|206.5
245|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Natural DS (T&L)|84.5|375|345|373
246|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost (Airwear BlueUV)|47.7|253|223|241
247|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Eyezen Boost (T&L BlueUV)|84.5|368|338|365.5
248|0|Monofocal|Digital|CR39|1.49|Eyezen Boost (Orma GEN S)|79.9|338|308|333
249|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost (Airwear GEN S)|89.1|368|338|365.5
250|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost (Airwear Xtractive New Gen)|89.1|368|338|365.5
251|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost (Airwear Xtractive Polarized)|147.75|463|433|468
252|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Eyezen Boost (T&L GEN S)|109.8|559|529|571.5
253|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost (Airwear Xperio Gris)|66.1|286|256|276.5
254|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost (Airwear Xperio Café)|79.9|323|293|316.5
255|0|Monofocal|Digital|CR39|1.49|Eyezen Boost (Orma Xperio)|106.35|412|382|413
256|0|Monofocal|Digital|CR39|1.49|Eyezen Boost (Orma)|38.5|228|198|214
257|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost (Airwear)|40.8|246|216|233.5
258|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Eyezen Boost (T&L)|81.05|327|297|321
259|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start (Airwear BlueUV)|47.7|253|223|241
260|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Eyezen Start (T&L BlueUV)|84.5|368|338|365.5
261|0|Monofocal|Digital|CR39|1.49|Eyezen Start (Orma GEN S)|79.9|338|308|333
262|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start (Airwear GEN S)|89.1|368|338|365.5
263|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start (Airwear Xtractive New Gen)|89.1|368|338|365.5
264|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start (Airwear Xtractive Polarized)|147.75|463|433|468
265|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Eyezen Start (T&L GEN S)|109.8|559|529|571.5
266|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start (Airwear Xperio Gris)|66.1|286|256|276.5
267|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start (Airwear Xperio Café)|79.9|323|293|316.5
268|0|Monofocal|Digital|CR39|1.49|Eyezen Start (Orma Xperio)|106.35|412|382|413
269|0|Monofocal|Digital|CR39|1.49|Eyezen Start (Orma)|38.5|228|198|214
270|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start (Airwear)|40.8|246|216|233.5
271|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Eyezen Start (T&L)|81.05|327|297|321
272|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Kids (Airwear BlueUV)|47.7|258|228|246.5
273|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Kids (Airwear GEN S)|89.1|368|338|365.5
274|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Kids (Airwear Xtractive New Gen)|89.1|368|338|365.5
275|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost + Crizal (Airwear BlueUV)|116.7|374|344|372
276|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Boost + Crizal (Airwear GEN S)|160.4|489|459|496
277|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start + Crizal (Airwear BlueUV)|116.7|374|344|372
278|0|Monofocal|Digital|Policarbonato|1.59|Eyezen Start + Crizal (Airwear GEN S)|160.4|489|459|496
279|0|Progresivo|Digital|Policarbonato|1.59|Unique DRO HD (Airwear BlueUV)|90.25|296|266|287.5
280|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Unique DRO HD (T&L BlueUV)|142|425|395|427
281|0|Progresivo|Digital|CR39|1.49|Unique DRO HD (Orma GEN S)|142|425|395|427
282|0|Progresivo|Digital|Policarbonato|1.59|Unique DRO HD (Airwear GEN S)|159.25|468|438|473.5
283|0|Progresivo|Digital|Policarbonato|1.59|Unique DRO HD (Airwear Xtractive New Gen)|159.25|468|438|473.5
284|0|Progresivo|Digital|Policarbonato|1.59|Unique DRO HD (Airwear Xtractive Polarized)|197.2|563|533|576
285|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Unique DRO HD (T&L GEN S)|216.75|615|585|632
286|0|Progresivo|Digital|Policarbonato|1.59|Unique DRO HD (Airwear Xperio Gris)|124.75|382|352|380.5
287|0|Progresivo|Digital|Policarbonato|1.59|Unique DRO HD (Airwear Xperio Café)|140.85|422|392|423.5
288|0|Progresivo|Digital|CR39|1.49|Unique DRO HD (Orma Xperio)|165|483|453|489.5
289|0|Progresivo|Digital|CR39|1.49|Unique DRO HD (Orma)|78.75|267|237|256
290|0|Progresivo|Digital|Policarbonato|1.59|Unique DRO HD (Airwear)|84.5|282|252|272.5
291|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Unique DRO HD (T&L)|136.25|411|381|411.5
292|0|Progresivo|Digital|Policarbonato|1.59|Network (Airwear BlueUV)|59.2|218|188|203.5
293|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Network (T&L BlueUV)|101.75|324|294|318
294|0|Progresivo|Digital|CR39|1.49|Network (Orma GEN S)|124.75|382|352|380.5
295|0|Progresivo|Digital|Policarbonato|1.59|Network (Airwear GEN S)|142|425|395|427
296|0|Progresivo|Digital|Policarbonato|1.59|Network (Airwear Xtractive New Gen)|142|425|395|427
297|0|Progresivo|Digital|Policarbonato|1.59|Network (Airwear Xtractive Polarized)|182.25|526|496|536
298|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Network (T&L GEN S)|193.75|554|524|566
299|0|Progresivo|Digital|Policarbonato|1.59|Network (Airwear Xperio Gris)|102.9|328|298|322
300|0|Progresivo|Digital|Policarbonato|1.59|Network (Airwear Xperio Café)|119|368|338|365.5
301|0|Progresivo|Digital|CR39|1.49|Network (Orma Xperio)|143.15|428|398|430
302|0|Progresivo|Digital|CR39|1.49|Network (Orma)|47.7|190|160|173
303|0|Progresivo|Digital|Policarbonato|1.59|Network (Airwear)|52.3|201|171|185
304|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Network (T&L)|96|310|280|302.5
305|0|Progresivo|Digital|Policarbonato|1.59|Easy Digital (Airwear BlueUV)|50|195|165|178.5
306|0|Progresivo|Digital|CR39|1.49|Easy Digital (Orma GEN S)|109.8|345|315|340.5
307|0|Progresivo|Digital|Policarbonato|1.59|Easy Digital (Airwear GEN S)|119|368|338|365.5
308|0|Progresivo|Digital|Policarbonato|1.59|Easy Digital (Airwear Xtractive New Gen)|119|368|338|365.5
309|0|Progresivo|Digital|Policarbonato|1.59|Easy Digital (Airwear Xtractive Polarized)|170.75|497|467|504.5
310|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Easy Digital (T&L GEN S)|136.25|411|381|411.5
311|0|Progresivo|Digital|Policarbonato|1.59|Easy Digital (Airwear Xperio Gris)|91.4|299|269|291
312|0|Progresivo|Digital|Policarbonato|1.59|Easy Digital (Airwear Xperio Café)|107.5|339|309|334
313|0|Progresivo|Digital|CR39|1.49|Easy Digital (Orma Xperio)|131.65|399|369|399
314|0|Progresivo|Digital|CR39|1.49|Easy Digital (Orma)|38.5|167|137|148
315|0|Progresivo|Digital|Policarbonato|1.59|Easy Digital (Airwear)|44.25|181|151|163.5
316|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Easy Digital (T&L)|84.5|282|252|272.5
317|0|Monofocal|Digital|Policarbonato|1.59|Softwear (Airwear BlueUV)|44.25|181|151|163.5
318|0|Monofocal|Digital|CR39|1.49|Softwear (Orma)|36.2|161|131|141.5
319|0|Monofocal|Digital|Policarbonato|1.59|Softwear (Airwear)|38.5|167|137|148
320|0|Monofocal|Digital|Policarbonato|1.59|Single Vision (Airwear BlueUV)|41.95|175|145|157
321|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Single Vision (T&L BlueUV)|73|253|223|241
322|0|Monofocal|Digital|CR39|1.49|Single Vision (Orma GEN S)|75.3|259|229|247.5
323|0|Monofocal|Digital|Policarbonato|1.59|Single Vision (Airwear GEN S)|90.25|296|266|287.5
324|0|Monofocal|Digital|Policarbonato|1.59|Single Vision (Airwear Xtractive New Gen)|90.25|296|266|287.5
325|0|Monofocal|Digital|Policarbonato|1.59|Single Vision (Airwear Xtractive Polarized)|130.5|397|367|396.5
326|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Single Vision (T&L GEN S)|96|310|280|302.5
327|0|Monofocal|Digital|Policarbonato|1.59|Single Vision (Airwear Xperio Gris)|77.6|264|234|253
328|0|Monofocal|Digital|Policarbonato|1.59|Single Vision (Airwear Xperio Café)|79.9|270|240|259.5
329|0|Monofocal|Digital|CR39|1.49|Single Vision (Orma Xperio)|117.85|365|335|362
330|0|Monofocal|Digital|CR39|1.49|Single Vision (Orma)|32.75|152|122|132
331|0|Monofocal|Digital|Policarbonato|1.59|Single Vision (Airwear)|38.5|167|137|148
332|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Single Vision (T&L)|67.25|238|208|225
333|0|Progresivo|Digital|Policarbonato|1.59|Schneider Premium (Poly Blue Raycut)|61.5|270|240|259.5
334|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Schneider Premium (T&L Blue Raycut)|96|338|308|333
335|0|Progresivo|Digital|CR39|1.49|Schneider Premium (CR39 GEN S)|114.4|370|340|367.5
336|0|Progresivo|Digital|Policarbonato|1.59|Schneider Premium (Poly GEN S)|122.45|402|372|402
337|0|Progresivo|Digital|Policarbonato|1.59|Schneider Premium (Poly Xtractive New Gen)|122.45|402|372|402
338|0|Progresivo|Digital|Policarbonato|1.59|Schneider Premium (Poly Xtractive Polarized)|159.25|515|485|524
339|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Schneider Premium (T&L GEN S)|170.75|531|501|541.5
340|0|Progresivo|Digital|CR39|1.49|Schneider Premium (CR39 Foto)|73|274|244|264
341|0|Progresivo|Digital|Policarbonato|1.59|Schneider Premium (Poly Foto)|84.5|306|276|298.5
342|0|Progresivo|Digital|Reducción (Mid Index)|1.56|Schneider Premium (Mid Index Drive Relax)|86.8|306|276|298.5
343|0|Progresivo|Digital|Reducción (Mid Index)|1.56|Schneider Premium (Mid Index Blue Raycut)|78.75|305|275|297
344|0|Progresivo|Digital|Reducción (Hi Index)|1.60|Schneider Premium (Hi Index Blue Raycut)|86.8|329|299|323
345|0|Progresivo|Digital|Policarbonato|1.59|Schneider Premium (Poly Xperio Gris)|81.05|290|260|281
346|0|Progresivo|Digital|Policarbonato|1.59|Schneider Premium (Poly Xperio Café)|93.7|356|326|352.5
347|0|Progresivo|Digital|CR39|1.49|Schneider Premium (CR39 Xperio)|124.75|408|378|408.5
348|0|Progresivo|Digital|CR39|1.49|Schneider Premium (CR39)|47.7|202|172|186
349|0|Progresivo|Digital|Policarbonato|1.59|Schneider Premium (Poly)|55.75|225|195|211
350|0|Progresivo|Digital|Reducción (Hi Index)|1.60|Schneider Premium (High Index)|63.8|247|217|234.5
351|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Schneider Premium (T&L)|90.25|331|301|325.5
352|0|Progresivo|Digital|Policarbonato|1.59|Schneider Superior (Poly Blue Raycut)|47.7|224|194|210
353|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Schneider Superior (T&L Blue Raycut)|73|274|244|264
354|0|Progresivo|Digital|CR39|1.49|Schneider Superior (CR39 GEN S)|91.4|306|276|298.5
355|0|Progresivo|Digital|Policarbonato|1.59|Schneider Superior (Poly GEN S)|109.8|363|333|360
356|0|Progresivo|Digital|Policarbonato|1.59|Schneider Superior (Poly Xtractive New Gen)|109.8|363|333|360
357|0|Progresivo|Digital|Policarbonato|1.59|Schneider Superior (Poly Xtractive Polarized)|147.75|483|453|489.5
358|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Schneider Superior (T&L GEN S)|147.75|467|437|472
359|0|Progresivo|Digital|CR39|1.49|Schneider Superior (CR39 Foto)|61.5|241|211|228
360|0|Progresivo|Digital|Policarbonato|1.59|Schneider Superior (Poly Foto)|73|274|244|264
361|0|Progresivo|Digital|Reducción (Mid Index)|1.56|Schneider Superior (Mid Index Drive Relax)|77.6|274|244|264
362|0|Progresivo|Digital|Reducción (Mid Index)|1.56|Schneider Superior (Mid Index Blue Raycut)|67.25|276|246|266
363|0|Progresivo|Digital|Reducción (Hi Index)|1.60|Schneider Superior (Hi Index Blue Raycut)|75.3|294|264|285.5
364|0|Progresivo|Digital|Policarbonato|1.59|Schneider Superior (Poly Xperio Gris)|70.7|260|230|248.5
365|0|Progresivo|Digital|Policarbonato|1.59|Schneider Superior (Poly Xperio Café)|89.1|312|282|305
366|0|Progresivo|Digital|CR39|1.49|Schneider Superior (CR39)|38.5|177|147|159
367|0|Progresivo|Digital|Policarbonato|1.59|Schneider Superior (Poly)|40.8|183|153|165.5
368|0|Progresivo|Digital|Reducción (Hi Index)|1.60|Schneider Superior (High Index)|46.55|199|169|183
369|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Schneider Superior (T&L)|61.5|267|237|256
370|0|Progresivo|Digital|Policarbonato|1.59|Ocupacional Tablet Office (Poly Blue Raycut)|40.8|201|171|185
371|0|Progresivo|Digital|CR39|1.49|Ocupacional Tablet Office (CR39)|36.2|170|140|151.5
372|0|Progresivo|Digital|Policarbonato|1.59|Ocupacional Tablet Office (Poly)|38.5|164|134|145
373|0|Progresivo|Digital|Policarbonato|1.59|Acomodativo Younger Style (Poly Blue Raycut)|36.2|186|156|168.5
374|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Acomodativo Younger Style (T&L Blue Raycut)|56.9|215|185|200
375|0|Progresivo|Digital|CR39|1.49|Acomodativo Younger Style (CR39 GEN S)|73|258|228|246.5
376|0|Progresivo|Digital|Policarbonato|1.59|Acomodativo Younger Style (Poly GEN S)|86.8|279|249|269
377|0|Progresivo|Digital|Policarbonato|1.59|Acomodativo Younger Style (Poly Xtractive New Gen)|86.8|279|249|269
378|0|Progresivo|Digital|Policarbonato|1.59|Acomodativo Younger Style (Poly Xtractive Polarized)|145.45|476|446|482
379|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Acomodativo Younger Style (T&L GEN S)|116.7|363|333|360
380|0|Progresivo|Digital|CR39|1.49|Acomodativo Younger Style (CR39 Foto)|50|215|185|200
381|0|Progresivo|Digital|Policarbonato|1.59|Acomodativo Younger Style (Poly Foto)|60.35|247|217|234.5
382|0|Progresivo|Digital|Reducción (Mid Index)|1.56|Acomodativo Younger Style (Mid Index Drive Relax)|59.2|247|217|234.5
383|0|Progresivo|Digital|Reducción (Mid Index)|1.56|Acomodativo Younger Style (Mid Index Blue Raycut)|55.75|251|221|239
384|0|Progresivo|Digital|Reducción (Hi Index)|1.60|Acomodativo Younger Style (Hi Index Blue Raycut)|63.8|277|247|267
385|0|Progresivo|Digital|Policarbonato|1.59|Acomodativo Younger Style (Poly Xperio Gris)|66.1|254|224|242
386|0|Progresivo|Digital|Policarbonato|1.59|Acomodativo Younger Style (Poly Xperio Café)|79.9|292|262|283
387|0|Progresivo|Digital|CR39|1.49|Acomodativo Younger Style (CR39)|31.6|145|115|124.5
388|0|Progresivo|Digital|Policarbonato|1.59|Acomodativo Younger Style (Poly)|36.2|158|128|138.5
389|0|Progresivo|Digital|Reducción (Hi Index)|1.60|Acomodativo Younger Style (High Index)|38.5|163|133|144
390|0|Progresivo|Digital|Alto Índice (Resina)|1.67|Acomodativo Younger Style (T&L)|50|209|179|193.5
391|0|Monofocal|Digital|Policarbonato|1.59|Monofocal VS Digital (Poly Blue Raycut)|33.9|178|148|160
392|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Monofocal VS Digital (T&L Blue Raycut)|54.6|209|179|193.5
393|0|Monofocal|Digital|CR39|1.49|Monofocal VS Digital (CR39 GEN S)|69.55|247|217|234.5
394|0|Monofocal|Digital|Policarbonato|1.59|Monofocal VS Digital (Poly GEN S)|83.35|274|244|264
395|0|Monofocal|Digital|Policarbonato|1.59|Monofocal VS Digital (Poly Xtractive New Gen)|83.35|274|244|264
396|0|Monofocal|Digital|Policarbonato|1.59|Monofocal VS Digital (Poly Xtractive Polarized)|142|467|437|472
397|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Monofocal VS Digital (T&L GEN S)|113.25|353|323|349
398|0|Monofocal|Digital|CR39|1.49|Monofocal VS Digital (CR39 Foto)|47.7|209|179|193.5
399|0|Monofocal|Digital|Policarbonato|1.59|Monofocal VS Digital (Poly Foto)|61.5|241|211|228
400|0|Monofocal|Digital|Reducción (Mid Index)|1.56|Monofocal VS Digital (Mid Index Drive Relax)|55.75|225|195|211
401|0|Monofocal|Digital|Reducción (Mid Index)|1.56|Monofocal VS Digital (Mid Index Blue Raycut)|58.05|259|229|247.5
402|0|Monofocal|Digital|Reducción (Hi Index)|1.60|Monofocal VS Digital (Hi Index Blue Raycut)|61.5|270|240|259.5
403|0|Monofocal|Digital|Policarbonato|1.59|Monofocal VS Digital (Poly Xperio Gris)|63.8|228|198|214
404|0|Monofocal|Digital|Policarbonato|1.59|Monofocal VS Digital (Poly Xperio Café)|77.6|247|217|234.5
405|0|Monofocal|Digital|CR39|1.49|Monofocal VS Digital (CR39 Xperio)|107.5|367|337|364
406|0|Monofocal|Digital|CR39|1.49|Monofocal VS Digital (CR39)|27|138|108|117
407|0|Monofocal|Digital|Policarbonato|1.59|Monofocal VS Digital (Poly)|31.6|151|121|131
408|0|Monofocal|Digital|Reducción (Hi Index)|1.60|Monofocal VS Digital (High Index)|36.2|170|140|151.5
409|0|Monofocal|Digital|Alto Índice (Resina)|1.67|Monofocal VS Digital (T&L)|50|202|172|186
$datos$, E'\n') as linea where linea <> '') d
where e.nombre in ('Shuvisión', 'Focus')
on conflict (empresa_id, codigo) do update set
  nombre = excluded.nombre, categoria = 'lente', clasificacion = excluded.clasificacion, diseno = excluded.diseno, linea = excluded.linea,
  material = excluded.material, indice = excluded.indice, tecnologia = excluded.tecnologia, costo_referencial = excluded.costo_referencial,
  precio_venta = excluded.precio_venta, precio_venta_2 = excluded.precio_venta_2, precio_convenio = excluded.precio_convenio,
  activo = true, actualizado_en = now();
