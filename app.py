"""
WellMech — Инженерные расчёты механики нефтяных скважин
Модель Johancsik (1984) для расчёта осевых нагрузок и трения
"""

import math
import io
import os
import datetime

from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd
import numpy as np

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors as rl_colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

app = Flask(__name__)

STEEL_DENSITY = 7.85  # г/см³
G = 9.81  # м/с²


# ════════════════════════════════════════════════════════════
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ════════════════════════════════════════════════════════════

def interpolate_survey(survey, depth):
    """Линейная интерполяция зенитного угла и азимута на заданной глубине."""
    depths = [s['depth'] for s in survey]
    if depth <= depths[0]:
        return survey[0]['inclination'], survey[0]['azimuth']
    if depth >= depths[-1]:
        return survey[-1]['inclination'], survey[-1]['azimuth']
    for i in range(len(depths) - 1):
        if depths[i] <= depth <= depths[i + 1]:
            t = (depth - depths[i]) / (depths[i + 1] - depths[i])
            incl = survey[i]['inclination'] + t * (survey[i + 1]['inclination'] - survey[i]['inclination'])
            azim = survey[i]['azimuth'] + t * (survey[i + 1]['azimuth'] - survey[i]['azimuth'])
            return incl, azim
    return survey[-1]['inclination'], survey[-1]['azimuth']


def get_mu(depth, mu_intervals, mu_default):
    """Коэффициент трения на заданной глубине."""
    for iv in (mu_intervals or []):
        if iv['depth_from'] <= depth <= iv['depth_to']:
            return iv['mu']
    return mu_default


def validate_survey(survey):
    if not survey or len(survey) < 2:
        raise ValueError("Требуется минимум 2 точки замера инклинометрии")
    for i, s in enumerate(survey):
        if s['depth'] < 0:
            raise ValueError(f"Точка {i+1}: глубина не может быть отрицательной")
        if not (0 <= s['inclination'] <= 180):
            raise ValueError(f"Точка {i+1}: зенитный угол должен быть от 0° до 180°")
        if not (0 <= s['azimuth'] < 360):
            raise ValueError(f"Точка {i+1}: азимут должен быть от 0° до 360°")
    for i in range(len(survey) - 1):
        if survey[i]['depth'] >= survey[i + 1]['depth']:
            raise ValueError("Точки замера должны быть отсортированы по возрастанию глубины")


def validate_assembly(assembly):
    if not assembly:
        raise ValueError("Компоновка пуста — добавьте хотя бы один элемент")
    for i, e in enumerate(assembly):
        if e.get('length', 0) <= 0:
            raise ValueError(f"Элемент «{e.get('name', i+1)}»: длина должна быть > 0")
        if e.get('weight_air', 0) <= 0:
            raise ValueError(f"Элемент «{e.get('name', i+1)}»: вес должен быть > 0")
        if e.get('max_load', 0) <= 0:
            raise ValueError(f"Элемент «{e.get('name', i+1)}»: макс. нагрузка должна быть > 0")


# ════════════════════════════════════════════════════════════
# МОДЕЛЬ JOHANCSIK (1984)
# ════════════════════════════════════════════════════════════

def johancsik_run(assembly, survey, target_depth, fluid_density,
                  mu_default, mu_intervals, direction='down', initial_force=0.0):
    """
    Расчёт осевых нагрузок по модели Johancsik (1984).

    Параметры:
        assembly     — список элементов (от забоя к устью)
        survey       — инклинометрия [{depth, inclination, azimuth}, ...]
        target_depth — глубина забоя компоновки (м)
        fluid_density — плотность раствора (г/см³)
        mu_default   — коэф. трения по умолчанию
        mu_intervals — [{depth_from, depth_to, mu}, ...]
        direction    — 'down' (спуск) или 'up' (подъём)
        initial_force — начальная сила на забое (кН)

    Возвращает:
        forces   — [{depth, force, element, W_b, N, friction}, ...]
        segments — детали по каждому элементу
    """
    bf = 1.0 - fluid_density / STEEL_DENSITY  # коэф. архимедовой поправки

    current_depth = target_depth
    forces = [{'depth': target_depth, 'force': round(initial_force, 3),
               'element': 'Забой', 'W_b': 0, 'N': 0, 'friction': 0}]
    segments = []
    F = initial_force

    for elem in assembly:
        bot = current_depth
        top = current_depth - elem['length']

        incl_bot, azim_bot = interpolate_survey(survey, bot)
        incl_top, azim_top = interpolate_survey(survey, top)

        ib = math.radians(incl_bot)
        it = math.radians(incl_top)
        ab = math.radians(azim_bot)
        at_ = math.radians(azim_top)

        i_avg = (ib + it) / 2.0
        di = it - ib
        da = at_ - ab
        # нормализация азимута
        if da > math.pi:
            da -= 2 * math.pi
        elif da < -math.pi:
            da += 2 * math.pi

        dogleg = math.sqrt(di ** 2 + (da * math.sin(i_avg)) ** 2)

        W_b = elem['weight_air'] * bf * G / 1000.0  # кН
        W_ax = W_b * math.cos(i_avg)
        W_n = W_b * math.sin(i_avg)

        mid = (bot + top) / 2.0
        mu = get_mu(mid, mu_intervals, mu_default)

        F_avg = abs(F + W_ax / 2.0)
        N = math.sqrt(W_n ** 2 + (F_avg * dogleg) ** 2)
        friction = mu * N

        if direction == 'down':
            F_top = F + W_ax - friction
        else:
            F_top = F + W_ax + friction

        seg = {
            'name': elem['name'],
            'bottom': round(bot, 2),
            'top': round(top, 2),
            'length': elem['length'],
            'weight_air': elem['weight_air'],
            'od': elem.get('od', 0),
            'max_load': elem.get('max_load', 0),
            'incl_bot': round(incl_bot, 2),
            'incl_top': round(incl_top, 2),
            'W_b': round(W_b, 3),
            'N': round(N, 3),
            'friction': round(friction, 3),
            'F_bottom': round(F, 3),
            'F_top': round(F_top, 3),
            'mu': mu,
        }
        segments.append(seg)

        forces.append({
            'depth': round(top, 2),
            'force': round(F_top, 3),
            'element': elem['name'],
            'W_b': round(W_b, 3),
            'N': round(N, 3),
            'friction': round(friction, 3),
        })
        F = F_top
        current_depth = top

    return forces, segments


# ════════════════════════════════════════════════════════════
# FLASK МАРШРУТЫ
# ════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/survey/upload', methods=['POST'])
def upload_survey():
    """Загрузка инклинометрии из CSV / Excel."""
    try:
        if 'file' not in request.files:
            return jsonify(success=False, error="Файл не найден в запросе")
        f = request.files['file']
        if not f.filename:
            return jsonify(success=False, error="Файл не выбран")

        ext = os.path.splitext(f.filename)[1].lower()
        if ext == '.csv':
            df = pd.read_csv(f)
        elif ext in ('.xlsx', '.xls'):
            df = pd.read_excel(f)
        else:
            return jsonify(success=False, error="Поддерживаются только CSV и Excel (.xlsx)")

        col_map = {}
        for col in df.columns:
            cl = col.strip().lower()
            if cl in ('depth', 'глубина', 'md', 'measured depth', 'глубина м'):
                col_map['depth'] = col
            elif cl in ('inclination', 'зенитный угол', 'incl', 'зенитный', 'угол', 'зенитный угол °'):
                col_map['inclination'] = col
            elif cl in ('azimuth', 'азимут', 'azim', 'azi', 'азимут °'):
                col_map['azimuth'] = col

        if len(col_map) < 3:
            return jsonify(success=False,
                           error="Не удалось найти колонки. Ожидаются: Глубина, Зенитный угол, Азимут")

        survey = []
        for _, row in df.iterrows():
            survey.append({
                'depth': float(row[col_map['depth']]),
                'inclination': float(row[col_map['inclination']]),
                'azimuth': float(row[col_map['azimuth']]),
            })

        validate_survey(survey)
        return jsonify(success=True, survey=survey, rows=len(survey))

    except ValueError as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f"Ошибка чтения файла: {e}")


@app.route('/api/calculate/reachability', methods=['POST'])
def calc_reachability():
    """Расчёт 1 — Доходимость до целевой глубины (спуск)."""
    try:
        data = request.get_json()
        survey = data['survey']
        assembly = data['assembly']
        target_depth = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        mu_default = float(data.get('mu_default', 0.25))
        mu_intervals = data.get('mu_intervals', [])

        validate_survey(survey)
        validate_assembly(assembly)

        total_len = sum(e['length'] for e in assembly)
        if total_len > target_depth:
            raise ValueError(
                f"Суммарная длина компоновки ({total_len:.1f} м) "
                f"превышает целевую глубину ({target_depth:.1f} м)")

        forces, segments = johancsik_run(
            assembly, survey, target_depth, fluid_density,
            mu_default, mu_intervals, direction='down')

        reaches = True
        critical_depth = None
        for fp in forces:
            if fp['force'] < 0:
                reaches = False
                critical_depth = fp['depth']
                break

        hook_load = forces[-1]['force'] if forces else 0
        total_friction = sum(s['friction'] for s in segments)

        return jsonify(
            success=True,
            reaches=reaches,
            critical_depth=critical_depth,
            hook_load=round(hook_load, 2),
            total_friction=round(total_friction, 2),
            forces=forces,
            segments=[{
                'name': s['name'], 'top': s['top'], 'bottom': s['bottom'],
                'W_b': s['W_b'], 'N': s['N'], 'friction': s['friction'],
                'F_bottom': s['F_bottom'], 'F_top': s['F_top'], 'mu': s['mu']
            } for s in segments],
        )
    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f"Ошибка расчёта: {e}")


@app.route('/api/calculate/hookload', methods=['POST'])
def calc_hookload():
    """Расчёт 3 — Вес на крюке при подъёме."""
    try:
        data = request.get_json()
        survey = data['survey']
        assembly = data['assembly']
        target_depth = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        mu_default = float(data.get('mu_default', 0.25))
        mu_intervals = data.get('mu_intervals', [])

        validate_survey(survey)
        validate_assembly(assembly)

        forces, segments = johancsik_run(
            assembly, survey, target_depth, fluid_density,
            mu_default, mu_intervals, direction='up')

        hook_load = forces[-1]['force'] if forces else 0
        total_weight_air = sum(e['weight_air'] for e in assembly) * G / 1000.0

        return jsonify(
            success=True,
            hook_load=round(hook_load, 2),
            total_weight_air=round(total_weight_air, 2),
            forces=forces,
            segments=[{
                'name': s['name'], 'top': s['top'], 'bottom': s['bottom'],
                'W_b': s['W_b'], 'N': s['N'], 'friction': s['friction'],
                'F_bottom': s['F_bottom'], 'F_top': s['F_top'], 'mu': s['mu']
            } for s in segments],
        )
    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f"Ошибка расчёта: {e}")


@app.route('/api/calculate/packer', methods=['POST'])
def calc_packer():
    """Расчёт 2 — Усилие срыва пакера."""
    try:
        data = request.get_json()
        survey = data['survey']
        assembly = data['assembly']
        target_depth = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        mu_default = float(data.get('mu_default', 0.25))
        mu_intervals = data.get('mu_intervals', [])
        packer_set_force = float(data['packer_set_force'])
        packer_idx = int(data['packer_element_index'])

        validate_survey(survey)
        validate_assembly(assembly)

        if packer_idx < 0 or packer_idx >= len(assembly):
            raise ValueError("Неверный индекс элемента-пакера")

        # Глубина верха пакера
        packer_top_depth = target_depth - sum(
            assembly[j]['length'] for j in range(packer_idx + 1))

        assembly_above = assembly[packer_idx + 1:]

        if not assembly_above:
            return jsonify(
                success=True,
                hook_load=round(packer_set_force, 2),
                packer_depth=round(packer_top_depth, 2),
                packer_set_force=packer_set_force,
                element_checks=[],
                weakest_element=None,
                min_safety_pct=None,
                is_safe=True,
                forces=[],
                message="Пакер — верхний элемент, выше него нет колонны",
            )

        forces, segments = johancsik_run(
            assembly_above, survey, packer_top_depth, fluid_density,
            mu_default, mu_intervals, direction='up',
            initial_force=packer_set_force)

        hook_load = forces[-1]['force'] if forces else packer_set_force

        # Проверка каждого элемента выше пакера
        element_checks = []
        for seg in segments:
            f_max = max(abs(seg['F_bottom']), abs(seg['F_top']))
            ml = seg['max_load']
            safety = (ml / f_max * 100.0) if f_max > 0 else 9999.0
            element_checks.append({
                'name': seg['name'],
                'max_load': ml,
                'actual_force': round(f_max, 2),
                'safety_pct': round(safety, 1),
                'ok': f_max <= ml,
            })

        weakest = min(element_checks, key=lambda x: x['safety_pct']) if element_checks else None
        is_safe = all(e['ok'] for e in element_checks)

        return jsonify(
            success=True,
            hook_load=round(hook_load, 2),
            packer_depth=round(packer_top_depth, 2),
            packer_set_force=packer_set_force,
            element_checks=element_checks,
            weakest_element=weakest,
            min_safety_pct=weakest['safety_pct'] if weakest else None,
            is_safe=is_safe,
            forces=forces,
        )
    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f"Ошибка расчёта: {e}")


# ════════════════════════════════════════════════════════════
# ЭКСПОРТ PDF
# ════════════════════════════════════════════════════════════

def _make_chart_image(forces, title, ylabel='Осевая нагрузка (кН)'):
    """Matplotlib-график → PNG в BytesIO."""
    depths = [f['depth'] for f in forces]
    vals = [f['force'] for f in forces]

    fig, ax = plt.subplots(figsize=(6.5, 3.5))
    fig.patch.set_facecolor('#14151f')
    ax.set_facecolor('#0f101a')
    ax.plot(vals, depths, color='#3d5afe', linewidth=1.8)
    ax.fill_betweenx(depths, vals, alpha=0.08, color='#3d5afe')
    ax.invert_yaxis()
    ax.set_xlabel(ylabel, color='#8b8fa8', fontsize=9)
    ax.set_ylabel('Глубина (м)', color='#8b8fa8', fontsize=9)
    ax.set_title(title, color='#e8eaf0', fontsize=11, pad=10)
    ax.tick_params(colors='#8b8fa8', labelsize=8)
    ax.grid(True, color='#1e2035', linewidth=0.5)
    for spine in ax.spines.values():
        spine.set_color('#1e2035')
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf


@app.route('/api/export/pdf', methods=['POST'])
def export_pdf():
    """Сгенерировать PDF-отчёт."""
    try:
        data = request.get_json()
        survey = data.get('survey', [])
        assembly = data.get('assembly', [])
        target_depth = float(data.get('target_depth', 0))
        fluid_density = float(data.get('fluid_density', 1.2))
        mu_default = float(data.get('mu_default', 0.25))
        mu_intervals = data.get('mu_intervals', [])
        packer_set_force = float(data.get('packer_set_force', 0))
        packer_idx = int(data.get('packer_element_index', 0))

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=20 * mm, rightMargin=20 * mm,
                                topMargin=20 * mm, bottomMargin=20 * mm)

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('TitleRu', parent=styles['Title'],
                                     fontSize=18, spaceAfter=6)
        h2 = ParagraphStyle('H2Ru', parent=styles['Heading2'],
                            fontSize=13, spaceAfter=4, spaceBefore=12)
        body = ParagraphStyle('BodyRu', parent=styles['Normal'], fontSize=9)

        hdr_color = rl_colors.HexColor('#1a3a5c')
        hdr_text = rl_colors.white
        alt_row = rl_colors.HexColor('#f0f4f8')

        elements = []

        # ── Заголовок ──
        elements.append(Paragraph("РАСЧЁТ МЕХАНИКИ НЕФТЯНОЙ СКВАЖИНЫ", title_style))
        elements.append(Paragraph(
            f"Дата: {datetime.datetime.now().strftime('%d.%m.%Y %H:%M')}", body))
        elements.append(Spacer(1, 8 * mm))

        # ── Параметры ──
        elements.append(Paragraph("1. Параметры скважины", h2))
        params_data = [
            ['Параметр', 'Значение'],
            ['Целевая глубина', f'{target_depth} м'],
            ['Плотность раствора', f'{fluid_density} г/см³'],
            ['Коэф. трения (по умолч.)', str(mu_default)],
        ]
        t = Table(params_data, colWidths=[120 * mm, 50 * mm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), hdr_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), hdr_text),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#cccccc')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, alt_row]),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 4 * mm))

        # ── Инклинометрия ──
        if survey:
            elements.append(Paragraph("Инклинометрия", h2))
            s_data = [['Глубина (м)', 'Зенитный угол (°)', 'Азимут (°)']]
            for s in survey[:50]:
                s_data.append([str(s['depth']), str(s['inclination']), str(s['azimuth'])])
            t = Table(s_data, colWidths=[56 * mm, 56 * mm, 56 * mm])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), hdr_color),
                ('TEXTCOLOR', (0, 0), (-1, 0), hdr_text),
                ('FONTSIZE', (0, 0), (-1, -1), 7),
                ('GRID', (0, 0), (-1, -1), 0.4, rl_colors.HexColor('#cccccc')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, alt_row]),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 4 * mm))

        # ── Компоновка ──
        if assembly:
            elements.append(Paragraph("2. Компоновка (от забоя к устью)", h2))
            a_data = [['Элемент', 'Длина (м)', 'Вес (кг)', 'OD (мм)', 'Макс. (кН)']]
            for e in assembly:
                a_data.append([
                    e.get('name', ''), str(e['length']),
                    str(e['weight_air']), str(e.get('od', '')),
                    str(e.get('max_load', '')),
                ])
            cw = [55 * mm, 25 * mm, 25 * mm, 28 * mm, 28 * mm]
            t = Table(a_data, colWidths=cw)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), hdr_color),
                ('TEXTCOLOR', (0, 0), (-1, 0), hdr_text),
                ('FONTSIZE', (0, 0), (-1, -1), 7),
                ('GRID', (0, 0), (-1, -1), 0.4, rl_colors.HexColor('#cccccc')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, alt_row]),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 4 * mm))

        # ── Расчёт доходимости ──
        if survey and assembly and target_depth > 0:
            elements.append(Paragraph("3. Доходимость до целевой глубины (спуск)", h2))
            try:
                forces_d, segs_d = johancsik_run(
                    assembly, survey, target_depth, fluid_density,
                    mu_default, mu_intervals, direction='down')
                reaches = all(f['force'] >= 0 for f in forces_d)
                crit = next((f['depth'] for f in forces_d if f['force'] < 0), None)
                status = "ДОХОДИТ" if reaches else f"НЕ ДОХОДИТ (крит. глубина {crit} м)"
                elements.append(Paragraph(f"Результат: {status}", body))
                elements.append(Spacer(1, 2 * mm))

                chart_buf = _make_chart_image(forces_d, 'Осевая нагрузка при спуске')
                elements.append(Image(chart_buf, width=160 * mm, height=86 * mm))
                elements.append(Spacer(1, 4 * mm))

                fd = [['Глубина (м)', 'Элемент', 'Сила (кН)', 'Трение (кН)']]
                for fp in forces_d:
                    fd.append([str(fp['depth']), fp['element'],
                               str(fp['force']), str(fp['friction'])])
                t = Table(fd, colWidths=[35 * mm, 50 * mm, 35 * mm, 35 * mm])
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), hdr_color),
                    ('TEXTCOLOR', (0, 0), (-1, 0), hdr_text),
                    ('FONTSIZE', (0, 0), (-1, -1), 7),
                    ('GRID', (0, 0), (-1, -1), 0.4, rl_colors.HexColor('#cccccc')),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, alt_row]),
                ]))
                elements.append(t)
            except Exception as e:
                elements.append(Paragraph(f"Ошибка: {e}", body))

            elements.append(Spacer(1, 6 * mm))

            # ── Вес на крюке ──
            elements.append(Paragraph("4. Вес на крюке при подъёме", h2))
            try:
                forces_u, segs_u = johancsik_run(
                    assembly, survey, target_depth, fluid_density,
                    mu_default, mu_intervals, direction='up')
                hl = forces_u[-1]['force'] if forces_u else 0
                elements.append(Paragraph(f"Вес на крюке: {hl:.2f} кН", body))
                elements.append(Spacer(1, 2 * mm))

                chart_buf2 = _make_chart_image(forces_u, 'Вес на крюке при подъёме')
                elements.append(Image(chart_buf2, width=160 * mm, height=86 * mm))
                elements.append(Spacer(1, 4 * mm))
            except Exception as e:
                elements.append(Paragraph(f"Ошибка: {e}", body))

            # ── Пакер ──
            if packer_set_force > 0 and packer_idx < len(assembly):
                elements.append(Paragraph("5. Усилие срыва пакера", h2))
                try:
                    packer_top = target_depth - sum(
                        assembly[j]['length'] for j in range(packer_idx + 1))
                    aa = assembly[packer_idx + 1:]
                    if aa:
                        fp, sp = johancsik_run(
                            aa, survey, packer_top, fluid_density,
                            mu_default, mu_intervals, direction='up',
                            initial_force=packer_set_force)
                        hl_p = fp[-1]['force'] if fp else packer_set_force
                        elements.append(Paragraph(
                            f"Нагрузка на крюке для срыва: {hl_p:.2f} кН", body))

                        weakest_name = ''
                        weakest_load = float('inf')
                        for s in sp:
                            if s['max_load'] < weakest_load:
                                weakest_load = s['max_load']
                                weakest_name = s['name']
                        f_max = max(abs(s['F_top']) for s in sp) if sp else 0
                        safety = weakest_load / f_max * 100 if f_max > 0 else 9999
                        elements.append(Paragraph(
                            f"Слабейший элемент: {weakest_name} "
                            f"({weakest_load:.1f} кН), "
                            f"запас прочности: {safety:.1f}%", body))
                except Exception as e:
                    elements.append(Paragraph(f"Ошибка: {e}", body))

        doc.build(elements)
        buf.seek(0)
        return send_file(buf, as_attachment=True,
                         download_name='wellmech_report.pdf',
                         mimetype='application/pdf')

    except Exception as e:
        return jsonify(success=False, error=str(e)), 500


# ════════════════════════════════════════════════════════════
# ЭКСПОРТ EXCEL
# ════════════════════════════════════════════════════════════

def _style_header(ws, row, ncols):
    fill = PatternFill(start_color='1a3a5c', end_color='1a3a5c', fill_type='solid')
    font = Font(color='FFFFFF', bold=True, size=9)
    border = Border(
        bottom=Side(style='thin', color='999999'),
        right=Side(style='thin', color='DDDDDD'),
    )
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = fill
        cell.font = font
        cell.border = border
        cell.alignment = Alignment(horizontal='center')


@app.route('/api/export/excel', methods=['POST'])
def export_excel():
    """Сгенерировать Excel-файл."""
    try:
        data = request.get_json()
        survey = data.get('survey', [])
        assembly = data.get('assembly', [])
        target_depth = float(data.get('target_depth', 0))
        fluid_density = float(data.get('fluid_density', 1.2))
        mu_default = float(data.get('mu_default', 0.25))
        mu_intervals = data.get('mu_intervals', [])
        packer_set_force = float(data.get('packer_set_force', 0))
        packer_idx = int(data.get('packer_element_index', 0))

        wb = openpyxl.Workbook()

        # ── Лист «Замеры» ──
        ws = wb.active
        ws.title = 'Замеры'
        headers = ['Глубина (м)', 'Зенитный угол (°)', 'Азимут (°)']
        ws.append(headers)
        _style_header(ws, 1, len(headers))
        for s in survey:
            ws.append([s['depth'], s['inclination'], s['azimuth']])
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = 18

        # ── Лист «Компоновка» ──
        ws2 = wb.create_sheet('Компоновка')
        h2 = ['Элемент', 'Длина (м)', 'Вес (кг)', 'Нар. диам. (мм)', 'Макс. нагрузка (кН)']
        ws2.append(h2)
        _style_header(ws2, 1, len(h2))
        for e in assembly:
            ws2.append([e.get('name', ''), e['length'], e['weight_air'],
                        e.get('od', 0), e.get('max_load', 0)])
        for col in ws2.columns:
            ws2.column_dimensions[col[0].column_letter].width = 20

        # ── Расчёты ──
        if survey and assembly and target_depth > 0:
            validate_survey(survey)
            validate_assembly(assembly)

            # Доходимость
            forces_d, _ = johancsik_run(
                assembly, survey, target_depth, fluid_density,
                mu_default, mu_intervals, direction='down')
            ws3 = wb.create_sheet('Доходимость')
            h3 = ['Глубина (м)', 'Элемент', 'Осевая сила (кН)',
                   'Вес архим. (кН)', 'Норм. сила (кН)', 'Трение (кН)']
            ws3.append(h3)
            _style_header(ws3, 1, len(h3))
            for fp in forces_d:
                ws3.append([fp['depth'], fp['element'], fp['force'],
                            fp['W_b'], fp['N'], fp['friction']])
            for col in ws3.columns:
                ws3.column_dimensions[col[0].column_letter].width = 18

            # Вес на крюке
            forces_u, _ = johancsik_run(
                assembly, survey, target_depth, fluid_density,
                mu_default, mu_intervals, direction='up')
            ws4 = wb.create_sheet('Вес на крюке')
            ws4.append(h3)
            _style_header(ws4, 1, len(h3))
            for fp in forces_u:
                ws4.append([fp['depth'], fp['element'], fp['force'],
                            fp['W_b'], fp['N'], fp['friction']])
            for col in ws4.columns:
                ws4.column_dimensions[col[0].column_letter].width = 18

            # Пакер
            if packer_set_force > 0 and packer_idx < len(assembly):
                packer_top = target_depth - sum(
                    assembly[j]['length'] for j in range(packer_idx + 1))
                aa = assembly[packer_idx + 1:]
                if aa:
                    fp_p, sp_p = johancsik_run(
                        aa, survey, packer_top, fluid_density,
                        mu_default, mu_intervals, direction='up',
                        initial_force=packer_set_force)
                    ws5 = wb.create_sheet('Пакер')
                    hp = ['Элемент', 'Макс. нагрузка (кН)',
                          'Факт. сила (кН)', 'Запас прочности (%)']
                    ws5.append(hp)
                    _style_header(ws5, 1, len(hp))
                    for seg in sp_p:
                        f_max = max(abs(seg['F_bottom']), abs(seg['F_top']))
                        ml = seg['max_load']
                        safety = ml / f_max * 100 if f_max > 0 else 9999
                        ws5.append([seg['name'], ml, round(f_max, 2),
                                    round(safety, 1)])
                    for col in ws5.columns:
                        ws5.column_dimensions[col[0].column_letter].width = 22

        out = io.BytesIO()
        wb.save(out)
        out.seek(0)
        return send_file(out, as_attachment=True,
                         download_name='wellmech_data.xlsx',
                         mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    except Exception as e:
        return jsonify(success=False, error=str(e)), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
