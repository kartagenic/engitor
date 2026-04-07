"""
WellMech — Инженерные расчёты механики нефтяных скважин
Модель Johancsik (1984) — Torque & Drag, доходимость, усилие срыва пакера
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
# ════════════════════════════════════════════════════════════
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ — ЖЁСТКАЯ СТРУНА И ЦЕНТРАЛИЗАТОРЫ
# ════════════════════════════════════════════════════════════

E_STEEL = 207_000.0  # МПа

def calc_EI(od_mm, linwt_kgm):
    """
    Бending stiffness EI (Н·м²) для трубного сечения.
    od_mm     — наружный диаметр, мм
    linwt_kgm — линейный вес, кг/м (приблизительно пропорционален площади сечения)
    """
    od = od_mm / 1000.0          # м
    # Стандартная площадь поперечного сечения: A = linwt/ρ_steel
    rho_s = 7850.0               # кг/м³
    A = linwt_kgm / rho_s        # м²
    # Для трубного сечения: I = π/64 × (OD⁴ − ID⁴)
    # ID из A = π/4 × (OD² − ID²): ID² = OD² − 4A/π
    id2 = od**2 - 4.0 * A / math.pi
    id2 = max(id2, 0.0)
    id_ = math.sqrt(id2)
    I = math.pi / 64.0 * (od**4 - id_**4)  # м⁴
    return E_STEEL * 1e6 * I                # Н·м²


def get_centralizer_factor(depth_m, centralizers, window=5.0):
    """
    Находит ближайший централизатор в пределах window м.
    Возвращает standoff (0..1) или 1.0 если нет.
    """
    if not centralizers:
        return 1.0
    best = None
    best_dist = window + 1
    for c in centralizers:
        dist = abs(c['depth'] - depth_m)
        if dist <= window and dist < best_dist:
            best_dist = dist
            best = c
    return best['standoff'] if best else 1.0


# ════════════════════════════════════════════════════════════
# МОДЕЛЬ JOHANCSIK (1984)
# ════════════════════════════════════════════════════════════

def johancsik_run(assembly, survey, target_depth, fluid_density,
                  mu_default, mu_intervals, direction='down', initial_force=0.0,
                  tortuosity=0.0, centralizers=None, use_stiff_string=False):
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
        # Add tortuosity: μ_eff = μ + tortuosity × dogleg (rad/m → uses dogleg already in rad)
        if tortuosity > 0:
            mu = mu + tortuosity * (dogleg / elem['length'] if elem['length'] > 0 else 0)

        F_avg = abs(F + W_ax / 2.0)
        N = math.sqrt(W_n ** 2 + (F_avg * dogleg) ** 2)

        # ── Stiff String correction (Mitchell 1986 simplified) ──
        if use_stiff_string and elem['length'] > 0:
            EI = calc_EI(elem.get('od', 127.0), elem.get('linwt', 30.0))
            # Bending correction per unit length [kN]
            q_bend = 2.0 * EI * (dogleg / elem['length']) / (elem['length'] * 1000.0)
            N = max(0.0, N - q_bend * elem['length'])

        # ── Centralizer standoff reduction ──
        mid_c = (bot + top) / 2.0
        standoff = get_centralizer_factor(mid_c, centralizers or [])
        N_eff = N * (1.0 - standoff) if standoff < 1.0 else N

        friction = mu * N_eff

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
            'N_eff': round(N_eff, 3),
            'friction': round(friction, 3),
            'F_bottom': round(F, 3),
            'F_top': round(F_top, 3),
            'mu': mu,
            'standoff': round(standoff, 3),
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
# TORQUE & DRAG — ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ
# ════════════════════════════════════════════════════════════

def calc_torque_profile(segments):
    """
    Крутящий момент по колонне (Johancsik 1984):
        ΔT(i) = μ(i) × N(i) × r(i)
    Накапливается снизу вверх — та же нормальная сила N,
    что при расчёте drag, умножается на радиус трубы.

    segments — список сегментов из johancsik_run (direction='down').
    Возвращает список {'depth', 'torque', 'element', 'dT'}.
    """
    torques = [{'depth': segments[0]['bottom'] if segments else 0,
                'torque': 0.0, 'element': 'Забой', 'dT': 0.0}]
    T = 0.0
    for seg in segments:
        od_mm = seg.get('od', 0)
        r = od_mm / 2000.0            # мм → м (радиус)
        if r < 0.02:
            r = 0.08                  # запасной радиус ~160 мм
        dT = seg['mu'] * seg['N'] * r  # кН·м
        T += dT
        torques.append({
            'depth': seg['top'],
            'torque': round(T, 3),
            'element': seg['name'],
            'dT': round(dT, 3),
        })
    return torques


def calc_buckling(segments_down):
    """
    Упрощённый анализ скачкообразного продольного изгиба (sinusoidal buckling).

    Критерий Paslay-Dawson для наклонного участка:
        F_cr_sin = 2 × √(E·I · w_b·sin(θ) / r_c)

    Для стальных труб E = 207 000 МПа.
    При отсутствии ID трубы используем типовой t = OD/11.
    r_c = радиальный зазор ≈ (D_скв - OD) / 2; без данных о диаметре
          скважины принимаем r_c = 25 мм (1 дюйм).

    Возвращает список словарей со статусом каждого сжатого сегмента.
    """
    E_steel = 207_000.0   # МПа
    r_clearance = 0.025   # м (зазор по умолчанию)

    result = []
    for seg in segments_down:
        # Максимальная сжимающая нагрузка в сегменте
        f_bot = seg['F_bottom']
        f_top = seg['F_top']
        f_comp = min(f_bot, f_top)   # отрицательное → сжатие
        if f_comp >= 0:
            continue  # нет сжатия — пропускаем

        compression = abs(f_comp)    # кН

        # Геометрия трубы
        od_m = seg.get('od', 127) / 1000.0   # мм → м
        t_m = od_m / 11.0                    # типовая толщина стенки
        id_m = od_m - 2 * t_m
        # Момент инерции полого сечения (м⁴)
        I = math.pi * (od_m ** 4 - id_m ** 4) / 64.0

        # Погонный вес (кН/м) × sin(θ) = нормальная нагрузка на 1 м
        incl_avg = math.radians((seg['incl_bot'] + seg['incl_top']) / 2.0)
        w_n = seg['W_b'] / seg['length'] * math.sin(incl_avg)  # кН/м

        # Критическая нагрузка синусоидального изгиба (кН)
        EI_kN = E_steel * 1e6 * I / 1000.0  # МПа·м⁴ → кН·м²
        if w_n > 0 and r_clearance > 0:
            F_cr_sin = 2.0 * math.sqrt(EI_kN * w_n / r_clearance)
        else:
            F_cr_sin = float('inf')

        # Критическая нагрузка спирального изгиба ≈ 2 × F_cr_sin
        F_cr_hel = 2.0 * F_cr_sin

        if compression < F_cr_sin:
            status = 'ok'
        elif compression < F_cr_hel:
            status = 'sinusoidal'
        else:
            status = 'helical'

        result.append({
            'name': seg['name'],
            'top': seg['top'],
            'bottom': seg['bottom'],
            'compression': round(compression, 2),
            'F_cr_sin': round(F_cr_sin, 2),
            'F_cr_hel': round(F_cr_hel, 2),
            'status': status,
            'incl_avg': round(math.degrees(incl_avg), 1),
        })

    return result


# ════════════════════════════════════════════════════════════
# ТРАЕКТОРИЯ СКВАЖИНЫ — МЕТОД МИНИМАЛЬНОЙ КРИВИЗНЫ
# ════════════════════════════════════════════════════════════

def interpolate_value(depths, values, target):
    """Линейная интерполяция значения на заданной глубине."""
    if target <= depths[0]:  return values[0]
    if target >= depths[-1]: return values[-1]
    for i in range(len(depths) - 1):
        if depths[i] <= target <= depths[i + 1]:
            t = (target - depths[i]) / (depths[i + 1] - depths[i])
            return values[i] + t * (values[i + 1] - values[i])
    return values[-1]


def minimum_curvature(survey):
    """
    Координаты скважины методом минимальной кривизны.
    Возвращает список точек: {md, inc, azi, tvd, north, east, hd, dls}.
    """
    pts = [{
        'md': survey[0]['depth'],
        'inc': survey[0]['inclination'],
        'azi': survey[0]['azimuth'],
        'tvd': 0.0, 'north': 0.0, 'east': 0.0, 'hd': 0.0, 'dls': 0.0,
    }]
    for i in range(len(survey) - 1):
        dl = survey[i + 1]['depth'] - survey[i]['depth']
        if dl <= 0:
            continue
        i1 = math.radians(survey[i]['inclination'])
        i2 = math.radians(survey[i + 1]['inclination'])
        a1 = math.radians(survey[i]['azimuth'])
        a2 = math.radians(survey[i + 1]['azimuth'])

        cos_dg = max(-1.0, min(1.0,
            math.cos(i1) * math.cos(i2) +
            math.sin(i1) * math.sin(i2) * math.cos(a2 - a1)))
        dg  = math.acos(cos_dg)
        dls = math.degrees(dg) / dl * 30.0
        rf  = (2.0 / dg * math.tan(dg / 2.0)) if dg > 1e-6 else 1.0

        dtvd  = dl / 2 * (math.cos(i1) + math.cos(i2)) * rf
        dn    = dl / 2 * (math.sin(i1) * math.cos(a1) + math.sin(i2) * math.cos(a2)) * rf
        de    = dl / 2 * (math.sin(i1) * math.sin(a1) + math.sin(i2) * math.sin(a2)) * rf

        p = pts[-1]
        n, e = p['north'] + dn, p['east'] + de
        pts.append({
            'md':    survey[i + 1]['depth'],
            'inc':   survey[i + 1]['inclination'],
            'azi':   survey[i + 1]['azimuth'],
            'tvd':   round(p['tvd'] + dtvd, 3),
            'north': round(n, 3),
            'east':  round(e, 3),
            'hd':    round(math.sqrt(n ** 2 + e ** 2), 3),
            'dls':   round(dls, 3),
        })
    return pts


def calc_stuck_pipe_risk(segments):
    """
    Оценка риска прихвата по удельной нормальной нагрузке N/L (кН/м):
      Низкий:    N/L < 1.0
      Средний:   1.0 ≤ N/L < 3.0
      Высокий:   N/L ≥ 3.0
    """
    result = []
    for s in segments:
        L = s['length'] if s['length'] > 0 else 1.0
        npl = s['N'] / L
        level = 'low' if npl < 1.0 else ('medium' if npl < 3.0 else 'high')
        result.append({
            'name':    s['name'],
            'top':     s['top'],
            'bottom':  s['bottom'],
            'N':       s['N'],
            'N_per_m': round(npl, 3),
            'risk':    level,
            'incl':    round((s['incl_bot'] + s['incl_top']) / 2, 1),
        })
    return result


# ════════════════════════════════════════════════════════════
# MATPLOTLIB — ВСПОМОГАТЕЛЬНЫЕ ГРАФИКИ ДЛЯ PDF
# ════════════════════════════════════════════════════════════

def _td_drag_chart(forces_down, forces_up, title='Осевые нагрузки (T&D)'):
    """Совмещённый график RIH / POOH."""
    depths_d = [f['depth'] for f in forces_down]
    rih = [f['force'] for f in forces_down]
    depths_u = [f['depth'] for f in forces_up]
    pooh = [f['force'] for f in forces_up]

    fig, ax = plt.subplots(figsize=(7, 4.5))
    fig.patch.set_facecolor('#14151f')
    ax.set_facecolor('#0a0b12')

    ax.fill_betweenx(depths_d, rih, pooh, alpha=0.10, color='#ffab00')
    ax.plot(rih, depths_d, color='#3d5afe', lw=2, label='Спуск (RIH)')
    ax.plot(pooh, depths_u, color='#00c853', lw=2, label='Подъём (POOH)')
    ax.axvline(0, color='#4a4d65', lw=1, ls='--', label='0 кН')

    ax.invert_yaxis()
    ax.set_xlabel('Осевая нагрузка (кН)', color='#8b8fa8', fontsize=9)
    ax.set_ylabel('Глубина (м)',           color='#8b8fa8', fontsize=9)
    ax.set_title(title, color='#e8eaf0', fontsize=11, pad=8)
    ax.tick_params(colors='#8b8fa8', labelsize=8)
    ax.grid(True, color='#1e2035', lw=0.5)
    for sp in ax.spines.values():
        sp.set_color('#1e2035')
    leg = ax.legend(facecolor='#14151f', edgecolor='#1e2035',
                    labelcolor='#8b8fa8', fontsize=8)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf


def _td_torque_chart(torque_profile, title='Крутящий момент'):
    depths = [t['depth'] for t in torque_profile]
    torqs = [t['torque'] for t in torque_profile]

    fig, ax = plt.subplots(figsize=(7, 4))
    fig.patch.set_facecolor('#14151f')
    ax.set_facecolor('#0a0b12')

    ax.plot(torqs, depths, color='#ffab00', lw=2, label='Момент')
    ax.fill_betweenx(depths, torqs, alpha=0.09, color='#ffab00')

    ax.invert_yaxis()
    ax.set_xlabel('Крутящий момент (кН·м)', color='#8b8fa8', fontsize=9)
    ax.set_ylabel('Глубина (м)',             color='#8b8fa8', fontsize=9)
    ax.set_title(title, color='#e8eaf0', fontsize=11, pad=8)
    ax.tick_params(colors='#8b8fa8', labelsize=8)
    ax.grid(True, color='#1e2035', lw=0.5)
    for sp in ax.spines.values():
        sp.set_color('#1e2035')
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf


def _td_friction_chart(segments_down, segments_up):
    """Распределение трения по элементам (горизонтальный bar chart)."""
    names   = [s['name'] for s in segments_down]
    f_down  = [s['friction'] for s in segments_down]
    f_up    = [s['friction'] for s in segments_up]
    y = list(range(len(names)))

    fig, ax = plt.subplots(figsize=(7, max(3, len(names) * 0.5 + 1)))
    fig.patch.set_facecolor('#14151f')
    ax.set_facecolor('#0a0b12')

    bar_h = 0.35
    ax.barh([yi + bar_h/2 for yi in y], f_down, bar_h,
            color='#3d5afe', alpha=0.85, label='Спуск')
    ax.barh([yi - bar_h/2 for yi in y], f_up, bar_h,
            color='#00c853', alpha=0.85, label='Подъём')

    ax.set_yticks(y)
    ax.set_yticklabels(names, fontsize=8, color='#8b8fa8')
    ax.set_xlabel('Сила трения (кН)', color='#8b8fa8', fontsize=9)
    ax.set_title('Трение по элементам компоновки', color='#e8eaf0', fontsize=11, pad=8)
    ax.tick_params(colors='#8b8fa8', labelsize=8)
    ax.grid(True, axis='x', color='#1e2035', lw=0.5)
    for sp in ax.spines.values():
        sp.set_color('#1e2035')
    leg = ax.legend(facecolor='#14151f', edgecolor='#1e2035',
                    labelcolor='#8b8fa8', fontsize=8)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf


# ════════════════════════════════════════════════════════════
# FLASK МАРШРУТЫ
# ════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/calculate/torque_drag', methods=['POST'])
def calc_torque_drag():
    """
    Полный анализ Torque & Drag:
      - Осевые нагрузки при спуске (RIH)
      - Осевые нагрузки при подъёме (POOH)
      - Профиль крутящего момента
      - Анализ продольного изгиба
    """
    try:
        data = request.get_json()
        survey        = data['survey']
        assembly      = data['assembly']
        target_depth  = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        mu_default      = float(data.get('mu_default', 0.25))
        mu_intervals    = data.get('mu_intervals', [])
        op_mode         = data.get('op_mode', 'rih_slide')
        wob             = float(data.get('wob', 0.0))
        tortuosity      = float(data.get('tortuosity', 0.0))
        centralizers    = data.get('centralizers', [])
        use_stiff_string = bool(data.get('use_stiff_string', False))

        validate_survey(survey)
        validate_assembly(assembly)

        total_len = sum(e['length'] for e in assembly)
        if total_len > target_depth:
            raise ValueError(
                f"Суммарная длина компоновки ({total_len:.1f} м) "
                f"превышает целевую глубину ({target_depth:.1f} м)")

        bf = 1.0 - fluid_density / STEEL_DENSITY

        # ── Rotating mode: axial drag ≈ 0, only torque ──
        is_rotating = op_mode in ('rotate_off', 'rotate_on')
        mu_for_axial = 0.0 if is_rotating else mu_default
        mu_ivs_for_axial = [] if is_rotating else mu_intervals

        # For rotating_on: WOB acts as initial (negative) force at bit
        initial_force_down = -abs(wob) if (op_mode == 'rotate_on' and wob > 0) else 0.0

        # ── Осевые нагрузки ──────────────────────────────
        forces_rih, segs_rih = johancsik_run(
            assembly, survey, target_depth, fluid_density,
            mu_for_axial, mu_ivs_for_axial, direction='down',
            initial_force=initial_force_down, tortuosity=tortuosity,
            centralizers=centralizers, use_stiff_string=use_stiff_string)

        forces_pooh, segs_pooh = johancsik_run(
            assembly, survey, target_depth, fluid_density,
            mu_for_axial, mu_ivs_for_axial, direction='up',
            tortuosity=tortuosity,
            centralizers=centralizers, use_stiff_string=use_stiff_string)

        # ── Крутящий момент ───────────────────────────────
        # For rotating modes, re-run with actual μ to get realistic normal forces for torque
        if is_rotating:
            _, segs_for_torque = johancsik_run(
                assembly, survey, target_depth, fluid_density,
                mu_default, mu_intervals, direction='down', tortuosity=tortuosity,
                centralizers=centralizers, use_stiff_string=use_stiff_string)
        else:
            segs_for_torque = segs_rih
        torque_profile = calc_torque_profile(segs_for_torque)

        # ── Продольный изгиб ──────────────────────────────
        buckling = calc_buckling(segs_for_torque)

        # ── Агрегированные показатели ─────────────────────
        W_air_kN  = sum(e['weight_air'] for e in assembly) * G / 1000.0
        W_buoy_kN = W_air_kN * bf

        hookload_rih  = forces_rih[-1]['force']  if forces_rih  else 0.0
        hookload_pooh = forces_pooh[-1]['force'] if forces_pooh else 0.0
        torque_surf   = torque_profile[-1]['torque'] if torque_profile else 0.0

        total_drag_rih  = sum(s['friction'] for s in segs_rih)
        total_drag_pooh = sum(s['friction'] for s in segs_pooh)
        drag_factor = ((hookload_pooh - hookload_rih) / (2.0 * W_buoy_kN)
                       if W_buoy_kN > 0 else 0.0)

        # Совмещённая таблица по элементам
        segments_combined = []
        for i, s in enumerate(segs_rih):
            sp = segs_pooh[i] if i < len(segs_pooh) else {}
            od_mm = s.get('od', 0)
            r = od_mm / 2000.0 if od_mm > 0 else 0.08
            dT = s['mu'] * s['N'] * r
            linwt = s['weight_air'] / s['length'] if s['length'] > 0 else 30.0
            segments_combined.append({
                'name':        s['name'],
                'top':         s['top'],
                'bottom':      s['bottom'],
                'incl_top':    s['incl_top'],
                'W_b':         s['W_b'],
                'N':           s['N'],
                'mu':          s['mu'],
                'F_rih_top':   s['F_top'],
                'F_pooh_top':  sp.get('F_top', 0),
                'friction_rih':  s['friction'],
                'friction_pooh': sp.get('friction', 0),
                'torque_dT':   round(dT, 3),
                'od':          od_mm,
                'linwt':       round(linwt, 2),
            })

        stuck_pipe = calc_stuck_pipe_risk(segs_rih)

        return jsonify(
            success=True,
            op_mode=op_mode,
            forces_rih=forces_rih,
            forces_pooh=forces_pooh,
            torque=torque_profile,
            buckling=buckling,
            stuck_pipe=stuck_pipe,
            hookload_rih=round(hookload_rih, 2),
            hookload_pooh=round(hookload_pooh, 2),
            torque_surface=round(torque_surf, 2),
            total_drag_rih=round(total_drag_rih, 2),
            total_drag_pooh=round(total_drag_pooh, 2),
            drag_factor=round(drag_factor, 3),
            W_air_kN=round(W_air_kN, 2),
            W_buoy_kN=round(W_buoy_kN, 2),
            segments=segments_combined,
        )

    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f"Ошибка расчёта T&D: {e}")


@app.route('/api/calculate/td_fan', methods=['POST'])
def calc_td_fan():
    """
    Веер кривых T&D при μ = 0.10 … 0.35.
    Возвращает профили Effective Tension (RIH и POOH) для каждого μ.
    """
    try:
        data = request.get_json()
        survey           = data['survey']
        assembly         = data['assembly']
        target_depth     = float(data['target_depth'])
        fluid_density    = float(data['fluid_density'])
        mu_intervals     = data.get('mu_intervals', [])
        tortuosity       = float(data.get('tortuosity', 0.0))
        centralizers     = data.get('centralizers', [])
        use_stiff_string = bool(data.get('use_stiff_string', False))

        validate_survey(survey)
        validate_assembly(assembly)

        mu_values = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35]
        fan_rih, fan_pooh = [], []

        for mu in mu_values:
            f_rih, _ = johancsik_run(
                assembly, survey, target_depth, fluid_density,
                mu, mu_intervals, direction='down', initial_force=0.0,
                tortuosity=tortuosity, centralizers=centralizers,
                use_stiff_string=use_stiff_string)
            f_pooh, _ = johancsik_run(
                assembly, survey, target_depth, fluid_density,
                mu, mu_intervals, direction='up', initial_force=0.0,
                tortuosity=tortuosity, centralizers=centralizers,
                use_stiff_string=use_stiff_string)
            fan_rih.append({
                'mu':     mu,
                'forces': [{'depth': f['depth'], 'force': f['force']} for f in f_rih],
            })
            fan_pooh.append({
                'mu':     mu,
                'forces': [{'depth': f['depth'], 'force': f['force']} for f in f_pooh],
            })

        return jsonify(success=True, fan_rih=fan_rih, fan_pooh=fan_pooh)
    except Exception as e:
        return jsonify(success=False, error=str(e))


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

        # ── WITSML XML ──────────────────────────────────────────
        if ext == '.xml':
            import xml.etree.ElementTree as ET
            tree = ET.parse(f)
            root = tree.getroot()
            # Определяем namespace
            ns = ''
            for elem in root.iter():
                if '}' in elem.tag:
                    ns = elem.tag[:elem.tag.index('}') + 1]
                    break
            stations = (root.findall(f'.//{ns}trajStation') or
                        root.findall('.//trajStation'))
            if not stations:
                return jsonify(success=False,
                               error="WITSML: не найдены элементы <trajStation>")
            survey = []
            for st in stations:
                md_el  = st.find(f'{ns}md')   or st.find('md')
                inc_el = st.find(f'{ns}incl') or st.find('incl')
                azi_el = st.find(f'{ns}azi')  or st.find('azi')
                if None in (md_el, inc_el, azi_el):
                    continue
                survey.append({
                    'depth':       float(md_el.text),
                    'inclination': float(inc_el.text),
                    'azimuth':     float(azi_el.text),
                })
            if not survey:
                return jsonify(success=False,
                               error="WITSML: не удалось извлечь данные замеров")
            validate_survey(survey)
            return jsonify(success=True, survey=survey, rows=len(survey),
                           source='witsml')

        # ── CSV / Excel ─────────────────────────────────────────
        if ext == '.csv':
            df = pd.read_csv(f)
        elif ext in ('.xlsx', '.xls'):
            df = pd.read_excel(f)
        else:
            return jsonify(success=False,
                           error="Поддерживаются форматы: CSV, Excel (.xlsx), WITSML (.xml)")

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
        tortuosity = float(data.get('tortuosity', 0.0))
        centralizers = data.get('centralizers', [])

        validate_survey(survey)
        validate_assembly(assembly)

        total_len = sum(e['length'] for e in assembly)
        if total_len > target_depth:
            raise ValueError(
                f"Суммарная длина компоновки ({total_len:.1f} м) "
                f"превышает целевую глубину ({target_depth:.1f} М)")

        forces, segments = johancsik_run(
            assembly, survey, target_depth, fluid_density,
            mu_default, mu_intervals, direction='down', tortuosity=tortuosity,
            centralizers=centralizers)

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
    """Расчёт 3 — Диапазон веса на крюке (RIH / POOH / срыв пакера) при μ от min до max."""
    try:
        data = request.get_json()
        survey        = data['survey']
        assembly      = data['assembly']
        target_depth  = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        mu_min        = float(data.get('mu_min', 0.15))
        mu_max        = float(data.get('mu_max', 0.30))
        packer_force  = float(data.get('packer_set_force', 0.0))
        centralizers  = data.get('centralizers', [])

        validate_survey(survey)
        validate_assembly(assembly)

        # Три значения μ: min, mid, max
        mu_mid = round((mu_min + mu_max) / 2, 3)
        mu_list = sorted({mu_min, mu_mid, mu_max})

        bf = 1.0 - fluid_density / STEEL_DENSITY
        total_weight_air_kN = sum(e['weight_air'] for e in assembly) * G / 1000.0

        results = {}
        for mu in mu_list:
            f_rih,  _ = johancsik_run(assembly, survey, target_depth, fluid_density,
                                      mu, [], direction='down', centralizers=centralizers)
            f_pooh, _ = johancsik_run(assembly, survey, target_depth, fluid_density,
                                      mu, [], direction='up', centralizers=centralizers)
            results[mu] = {
                'rih':  [{'depth': p['depth'], 'force': p['force']} for p in f_rih],
                'pooh': [{'depth': p['depth'], 'force': p['force']} for p in f_pooh],
            }

        def surface(forces):
            return forces[-1]['force'] if forces else 0.0

        # Summary stats (at surface, i.e. last point returned by johancsik_run)
        rih_min_F  = surface(results[mu_list[0]]['rih'])
        rih_max_F  = surface(results[mu_list[-1]]['rih'])
        pooh_min_F = surface(results[mu_list[0]]['pooh'])
        pooh_max_F = surface(results[mu_list[-1]]['pooh'])

        return jsonify(
            success=True,
            mu_min=mu_min, mu_mid=mu_mid, mu_max=mu_max,
            results=results,
            packer_set_force=packer_force,
            summary={
                'rih_surface_min':  round(rih_min_F, 2),
                'rih_surface_max':  round(rih_max_F, 2),
                'pooh_surface_min': round(pooh_min_F, 2),
                'pooh_surface_max': round(pooh_max_F, 2),
                'packer_min': round(pooh_min_F + packer_force, 2),
                'packer_max': round(pooh_max_F + packer_force, 2),
                'total_weight_air': round(total_weight_air_kN, 2),
                'buoyed_weight':    round(total_weight_air_kN * bf, 2),
            },
        )
    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f"Ошибка расчёта: {e}")


@app.route('/api/calculate/sensitivity', methods=['POST'])
def calc_sensitivity():
    """
    Анализ чувствительности (Tornado-chart).
    Варьирует μ, плотность раствора, суммарный вес BHA, целевую глубину на ±delta_pct%.
    Возвращает % изменение POOH hookload на поверхности относительно базового случая.
    """
    try:
        data = request.get_json()
        survey        = data['survey']
        assembly      = data['assembly']
        target_depth  = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        mu_base       = float(data.get('mu_base', 0.25))
        delta_pct     = float(data.get('delta_pct', 20.0)) / 100.0
        tortuosity    = float(data.get('tortuosity', 0.0))
        centralizers  = data.get('centralizers', [])

        validate_survey(survey)
        validate_assembly(assembly)

        def pooh_surface(asm, td, fd, mu):
            frc, _ = johancsik_run(asm, survey, td, fd, mu, [], direction='up',
                                   tortuosity=tortuosity, centralizers=centralizers)
            return frc[-1]['force'] if frc else 0.0

        def scale_assembly_weight(asm, factor):
            return [{**e, 'weight_air': e['weight_air'] * factor} for e in assembly]

        base = pooh_surface(assembly, target_depth, fluid_density, mu_base)

        params = []

        # ── μ ±delta_pct ──
        lo_mu = max(0.05, mu_base * (1 - delta_pct))
        hi_mu = min(0.80, mu_base * (1 + delta_pct))
        lo_f  = pooh_surface(assembly, target_depth, fluid_density, lo_mu)
        hi_f  = pooh_surface(assembly, target_depth, fluid_density, hi_mu)
        params.append({
            'name': f'Коэф. трения μ (±{int(delta_pct*100)}%)',
            'lo': round(lo_f, 2), 'hi': round(hi_f, 2),
            'lo_pct': round((lo_f - base) / abs(base) * 100, 1) if base else 0,
            'hi_pct': round((hi_f - base) / abs(base) * 100, 1) if base else 0,
        })

        # ── Плотность раствора ±delta_pct ──
        lo_fd = max(0.8, fluid_density * (1 - delta_pct))
        hi_fd = min(2.5, fluid_density * (1 + delta_pct))
        lo_f  = pooh_surface(assembly, target_depth, lo_fd, mu_base)
        hi_f  = pooh_surface(assembly, target_depth, hi_fd, mu_base)
        params.append({
            'name': f'Плотность раствора (±{int(delta_pct*100)}%)',
            'lo': round(lo_f, 2), 'hi': round(hi_f, 2),
            'lo_pct': round((lo_f - base) / abs(base) * 100, 1) if base else 0,
            'hi_pct': round((hi_f - base) / abs(base) * 100, 1) if base else 0,
        })

        # ── Вес BHA ±delta_pct ──
        lo_asm = scale_assembly_weight(assembly, 1 - delta_pct)
        hi_asm = scale_assembly_weight(assembly, 1 + delta_pct)
        lo_f   = pooh_surface(lo_asm, target_depth, fluid_density, mu_base)
        hi_f   = pooh_surface(hi_asm, target_depth, fluid_density, mu_base)
        params.append({
            'name': f'Вес BHA (±{int(delta_pct*100)}%)',
            'lo': round(lo_f, 2), 'hi': round(hi_f, 2),
            'lo_pct': round((lo_f - base) / abs(base) * 100, 1) if base else 0,
            'hi_pct': round((hi_f - base) / abs(base) * 100, 1) if base else 0,
        })

        # ── Целевая глубина ±delta_pct ──
        lo_td = max(100, target_depth * (1 - delta_pct))
        hi_td = target_depth * (1 + delta_pct)
        try:
            lo_f = pooh_surface(assembly, lo_td, fluid_density, mu_base)
        except Exception:
            lo_f = base
        try:
            hi_f = pooh_surface(assembly, hi_td, fluid_density, mu_base)
        except Exception:
            hi_f = base
        params.append({
            'name': f'Целевая глубина (±{int(delta_pct*100)}%)',
            'lo': round(lo_f, 2), 'hi': round(hi_f, 2),
            'lo_pct': round((lo_f - base) / abs(base) * 100, 1) if base else 0,
            'hi_pct': round((hi_f - base) / abs(base) * 100, 1) if base else 0,
        })

        return jsonify(success=True, base_pooh=round(base, 2), params=params)

    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f'Ошибка анализа: {e}')


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
        centralizers = data.get('centralizers', [])

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
            initial_force=packer_set_force, centralizers=centralizers)

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


@app.route('/api/calculate/trajectory', methods=['POST'])
def calc_trajectory():
    """Минимальная кривизна — координаты скважины (TVD, N, E, горизонтальное расстояние)."""
    try:
        data = request.get_json()
        survey = data['survey']
        validate_survey(survey)
        pts = minimum_curvature(survey)
        return jsonify(
            success=True,
            points=pts,
            max_tvd=round(max(p['tvd'] for p in pts), 1),
            max_hd=round(max(p['hd'] for p in pts), 1),
            max_dls=round(max(p['dls'] for p in pts), 2),
        )
    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f"Ошибка расчёта траектории: {e}")


@app.route('/api/calibrate/friction', methods=['POST'])
def calibrate_friction():
    """
    Калибровка коэффициента трения по полевым замерам нагрузки на крюке.
    Метод: минимизация RMS-отклонения расчётных значений от измеренных.
    """
    try:
        data          = request.get_json()
        survey        = data['survey']
        assembly      = data['assembly']
        target_depth  = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        field_data    = data['field_data']   # [{depth, hookload}, ...]
        direction     = data.get('direction', 'up')
        centralizers  = data.get('centralizers', [])

        if not field_data:
            raise ValueError("Нет полевых замеров для калибровки")
        validate_survey(survey)
        validate_assembly(assembly)

        def rms(mu_val):
            frc, _ = johancsik_run(assembly, survey, target_depth,
                                   fluid_density, mu_val, [], direction=direction,
                                   centralizers=centralizers)
            ds = [f['depth'] for f in frc]
            vs = [f['force'] for f in frc]
            return math.sqrt(
                sum((interpolate_value(ds, vs, fm['depth']) - fm['hookload']) ** 2
                    for fm in field_data) / len(field_data))

        # Грубый поиск (шаг 0.05, диапазон 0.05–0.80)
        best_mu, best_rms = 0.25, float('inf')
        for mu in [i * 0.05 for i in range(1, 17)]:
            r = rms(mu)
            if r < best_rms:
                best_rms, best_mu = r, mu

        # Точный поиск (шаг 0.005)
        for mu in [best_mu + i * 0.005 for i in range(-8, 9)]:
            mu = max(0.05, min(0.80, mu))
            r = rms(mu)
            if r < best_rms:
                best_rms, best_mu = r, mu

        frc_f, _ = johancsik_run(assembly, survey, target_depth,
                                  fluid_density, best_mu, [], direction=direction,
                                  centralizers=centralizers)
        ds = [f['depth'] for f in frc_f]
        vs = [f['force'] for f in frc_f]
        comp = []
        for fm in field_data:
            calc = interpolate_value(ds, vs, fm['depth'])
            comp.append({
                'depth':      fm['depth'],
                'measured':   fm['hookload'],
                'calculated': round(calc, 2),
                'error':      round(calc - fm['hookload'], 2),
                'error_pct':  round((calc - fm['hookload']) / fm['hookload'] * 100, 1)
                              if fm['hookload'] != 0 else 0,
            })

        return jsonify(
            success=True,
            mu_calibrated=round(best_mu, 4),
            rms_error=round(best_rms, 2),
            comparison=comp,
            forces=frc_f,
        )
    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f"Ошибка калибровки: {e}")


# ════════════════════════════════════════════════════════════
# ЦЕМЕНТИРОВАНИЕ ХВОСТОВИКА
# ════════════════════════════════════════════════════════════

@app.route('/api/calculate/cementing', methods=['POST'])
def calc_cementing():
    """
    Расчёт нагрузки на крюке при цементировании хвостовика.

    Модель: непрерывная кривая hookload vs объём закачки.
    Стадии:
      1. До работ (весь ствол — буровой раствор): F = F_base
      2. Цемент заполняет колонну (тяжелее раствора) → нагрузка ↑
      3. Цемент выходит из башмака, заполняет КП → нагрузка ↓ из-за эффекта выталкивания
      4. Продавка завершена — цемент полностью в КП: F = F_base + net_cement_weight
    """
    try:
        data = request.get_json()
        survey        = data['survey']
        assembly      = data['assembly']
        target_depth  = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        mu_default    = float(data.get('mu_default', 0.25))
        mu_intervals  = data.get('mu_intervals', [])
        centralizers  = data.get('centralizers', [])

        liner_top       = float(data['liner_top'])
        liner_shoe      = target_depth  # башмак хвостовика = целевая глубина
        string_cap_lpm  = float(data.get('string_cap_lpm', 6.5))   # л/м колонны
        annulus_cap_lpm = float(data.get('annulus_cap_lpm', 8.0))   # л/м КП хвостовика
        cement_density  = float(data.get('cement_density', 1.85))   # г/см³
        disp_density    = float(data.get('disp_density', fluid_density))  # г/см³

        validate_survey(survey)
        validate_assembly(assembly)

        liner_length = liner_shoe - liner_top
        if liner_length <= 0:
            raise ValueError("Глубина верха хвостовика должна быть меньше целевой глубины")

        # Базовая нагрузка на крюке (спуск, трение = 0, только вес в растворе)
        forces_base, _ = johancsik_run(
            assembly, survey, target_depth, fluid_density,
            0.0, [], direction='down', centralizers=centralizers)
        F_base = forces_base[-1]['force'] if forces_base else 0.0

        # Объёмы (литры)
        V_string = string_cap_lpm * liner_shoe        # всё бурильное до башмака
        V_liner_ann = annulus_cap_lpm * liner_length  # КП хвостовика

        V_total = V_string + V_liner_ann

        # Кривая: нагрузка vs объём закачки (м³ для читаемости)
        N_pts = 80
        curve_v, curve_f = [], []
        for i in range(N_pts + 1):
            V = V_total * i / N_pts

            # Цемент в колонне (увеличивает нагрузку)
            v_cem_str = min(V, V_string)
            # Цемент в КП хвостовика (уменьшает нагрузку — выталкивает хвостовик)
            v_cem_ann = min(max(0.0, V - V_string), V_liner_ann)

            # ΔF_string: цемент тяжелее раствора → бурильная колонна тяжелее
            dF_str = (cement_density - fluid_density) * v_cem_str * G / 1000.0   # кН

            # ΔF_ann: цемент в КП тяжелее раствора → гидростатика давит вверх
            #         (хвостовик выталкивается, снимая нагрузку с бурильной колонны)
            dF_ann = -(cement_density - fluid_density) * v_cem_ann * G / 1000.0  # кН

            F = F_base + dF_str + dF_ann
            curve_v.append(round(V / 1000.0, 3))   # м³
            curve_f.append(round(F, 2))

        # Ключевые точки
        F_pre   = round(F_base, 2)
        F_peak  = round(F_base + (cement_density - fluid_density) * V_string * G / 1000.0, 2)
        F_end_pump = round(F_base + (cement_density - fluid_density) * (V_string - V_liner_ann) * G / 1000.0, 2)

        # Сравнение: продавочная жидкость vs цемент в колонне
        v_disp_start = V_string + V_liner_ann
        v_disp_str = min(V_total, V_string)

        stages = [
            {'name': 'До работ (весь ствол — буровой раствор)', 'volume_m3': 0.0,
             'hookload': F_pre, 'note': 'Базовый'},
            {'name': 'Цемент заполнил колонну (пик нагрузки)', 'volume_m3': round(V_string / 1000.0, 3),
             'hookload': F_peak, 'note': 'Максимум'},
            {'name': 'Цемент полностью в КП (продавка завершена)', 'volume_m3': round(V_total / 1000.0, 3),
             'hookload': F_end_pump, 'note': 'Конец работ'},
        ]

        return jsonify(
            success=True,
            F_base=F_pre,
            F_peak=F_peak,
            F_end=F_end_pump,
            V_string_m3=round(V_string / 1000.0, 3),
            V_liner_ann_m3=round(V_liner_ann / 1000.0, 3),
            V_total_m3=round(V_total / 1000.0, 3),
            liner_length=round(liner_length, 1),
            curve_volume=curve_v,
            curve_hookload=curve_f,
            stages=stages,
        )
    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f'Ошибка цементирования: {e}')


# ════════════════════════════════════════════════════════════
# ФЛОТАЦИЯ ОБСАДНОЙ КОЛОННЫ
# ════════════════════════════════════════════════════════════

@app.route('/api/calculate/flotation', methods=['POST'])
def calc_flotation():
    """
    Флотация обсадной колонны: спуск с заглушённым башмаком (воздух/лёгкая жидкость внутри).

    Физика: давление бурового раствора снаружи > давление лёгкой заливки внутри →
    дополнительная выталкивающая сила = (ρ_mud - ρ_fill) × g × V_internal.
    """
    try:
        data = request.get_json()
        survey        = data['survey']
        assembly      = data['assembly']
        target_depth  = float(data['target_depth'])
        fluid_density = float(data['fluid_density'])
        mu_default    = float(data.get('mu_default', 0.25))
        mu_intervals  = data.get('mu_intervals', [])
        centralizers  = data.get('centralizers', [])
        fill_density  = float(data.get('fill_density', 0.0013))   # г/см³ (воздух по умолчанию)
        rig_capacity  = float(data.get('rig_capacity', 0.0))       # кН (0 = не задан)

        validate_survey(survey)
        validate_assembly(assembly)

        # Стандартный спуск (буровой раствор внутри и снаружи)
        forces_std, segs_std = johancsik_run(
            assembly, survey, target_depth, fluid_density,
            mu_default, mu_intervals, direction='down', centralizers=centralizers)

        # Флотация: модифицируем assembly — уменьшаем эффективный вес за счёт внутренней заливки
        BF = 1.0 - fluid_density / STEEL_DENSITY
        rho_steel_kgm3 = STEEL_DENSITY * 1000.0  # г/см³ → кг/м³

        flotation_assembly = []
        total_inner_vol_m3 = 0.0
        for elem in assembly:
            od_m    = elem.get('od', 127.0) / 1000.0     # мм → м
            linwt   = elem.get('linwt', elem['weight_air'] / max(elem['length'], 0.001))  # кг/м
            A_ext   = math.pi / 4.0 * od_m ** 2           # м²
            A_metal = linwt / rho_steel_kgm3               # м²
            A_int   = max(0.0, A_ext - A_metal)            # м² внутренний просвет

            total_inner_vol_m3 += A_int * elem['length']

            # Доп. подъёмная сила от заливки (кН)
            extra_buoy_kN = (fluid_density - fill_density) * 1000.0 * G * A_int * elem['length'] / 1000.0

            # Корректируем weight_air так, чтобы johancsik дал правильную W_b
            # johancsik: W_b = weight_air × BF × G / 1000
            # Нам нужно: W_b_float = W_b_std - extra_buoy_kN
            # ⇒ weight_air_mod = weight_air - extra_buoy_kN × 1000 / (BF × G)
            if BF > 0:
                W_air_mod = elem['weight_air'] - extra_buoy_kN * 1000.0 / (BF * G)
            else:
                W_air_mod = elem['weight_air']
            W_air_mod = max(0.0, W_air_mod)

            flotation_assembly.append({**elem, 'weight_air': W_air_mod})

        forces_flot, _ = johancsik_run(
            flotation_assembly, survey, target_depth, fluid_density,
            mu_default, mu_intervals, direction='down', centralizers=centralizers)

        F_std  = forces_std[-1]['force']  if forces_std  else 0.0
        F_flot = forces_flot[-1]['force'] if forces_flot else 0.0
        reduction_kN  = round(F_std - F_flot, 2)
        reduction_pct = round(reduction_kN / abs(F_std) * 100, 1) if F_std else 0.0

        # Профили по глубине
        depths     = [f['depth'] for f in forces_std]
        f_std_list = [round(f['force'], 2) for f in forces_std]
        f_flot_list= [round(f['force'], 2) for f in forces_flot]

        # Нейтральная точка флотации (где нагрузка → 0)
        neutral_depth = None
        for fp in forces_flot:
            if fp['force'] <= 0:
                neutral_depth = round(fp['depth'], 1)
                break

        # Максимальная глубина при ограничении крюком
        max_depth_std  = target_depth
        max_depth_flot = target_depth
        if rig_capacity > 0:
            for fp in forces_std:
                if fp['force'] > rig_capacity:
                    max_depth_std = round(fp['depth'], 1)
                    break
            for fp in forces_flot:
                if fp['force'] > rig_capacity:
                    max_depth_flot = round(fp['depth'], 1)
                    break

        return jsonify(
            success=True,
            F_standard=round(F_std, 2),
            F_flotation=round(F_flot, 2),
            reduction_kN=reduction_kN,
            reduction_pct=reduction_pct,
            total_inner_vol_m3=round(total_inner_vol_m3, 4),
            neutral_depth=neutral_depth,
            max_depth_std=max_depth_std,
            max_depth_flot=max_depth_flot,
            depths=depths,
            f_standard=f_std_list,
            f_flotation=f_flot_list,
        )
    except (ValueError, KeyError) as e:
        return jsonify(success=False, error=str(e))
    except Exception as e:
        return jsonify(success=False, error=f'Ошибка расчёта флотации: {e}')


@app.route('/api/export/pdf', methods=['POST'])
def export_pdf():
    """Полный PDF-отчёт: входные данные + Torque & Drag + доходимость + пакер."""
    try:
        data = request.get_json()
        survey           = data.get('survey', [])
        assembly         = data.get('assembly', [])
        target_depth     = float(data.get('target_depth', 0))
        fluid_density    = float(data.get('fluid_density', 1.2))
        mu_default       = float(data.get('mu_default', 0.25))
        mu_intervals     = data.get('mu_intervals', [])
        packer_set_force = float(data.get('packer_set_force', 0))
        packer_idx       = int(data.get('packer_element_index', 0))
        centralizers     = data.get('centralizers', [])

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=18*mm, rightMargin=18*mm,
                                topMargin=18*mm, bottomMargin=18*mm)

        styles  = getSampleStyleSheet()
        h1_s    = ParagraphStyle('h1', parent=styles['Title'],   fontSize=17, spaceAfter=4)
        h2_s    = ParagraphStyle('h2', parent=styles['Heading2'],fontSize=12, spaceBefore=10, spaceAfter=4)
        h3_s    = ParagraphStyle('h3', parent=styles['Heading3'],fontSize=10, spaceBefore=6, spaceAfter=3)
        body_s  = ParagraphStyle('bo', parent=styles['Normal'],  fontSize=8)
        ok_s    = ParagraphStyle('ok', parent=styles['Normal'],  fontSize=9,
                                 textColor=rl_colors.HexColor('#006400'))
        err_s   = ParagraphStyle('er', parent=styles['Normal'],  fontSize=9,
                                 textColor=rl_colors.HexColor('#b20000'))
        warn_s  = ParagraphStyle('wa', parent=styles['Normal'],  fontSize=9,
                                 textColor=rl_colors.HexColor('#7a5400'))

        HC = rl_colors.HexColor
        hdr_fill  = HC('#1a3a5c')
        hdr_text  = rl_colors.white
        alt_row   = HC('#f2f6fb')
        warn_fill = HC('#fff3cd')
        err_fill  = HC('#fce8e8')

        def _tbl(data_rows, col_widths, alt=True):
            t = Table(data_rows, colWidths=col_widths, repeatRows=1)
            style = [
                ('BACKGROUND', (0,0), (-1,0), hdr_fill),
                ('TEXTCOLOR',  (0,0), (-1,0), hdr_text),
                ('FONTSIZE',   (0,0), (-1,-1), 7),
                ('GRID',       (0,0), (-1,-1), 0.35, HC('#cccccc')),
                ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
            ]
            if alt:
                style.append(('ROWBACKGROUNDS', (0,1), (-1,-1),
                               [rl_colors.white, alt_row]))
            t.setStyle(TableStyle(style))
            return t

        els = []

        # ═══════════════════════════════════════════════════
        # ТИТУЛЬНАЯ СТРАНИЦА
        # ═══════════════════════════════════════════════════
        els.append(Spacer(1, 20*mm))
        els.append(Paragraph("ОТЧЁТ О РАСЧЁТЕ МЕХАНИКИ<br/>НЕФТЯНОЙ СКВАЖИНЫ", h1_s))
        els.append(Spacer(1, 6*mm))
        els.append(Paragraph(
            f"Torque &amp; Drag — модель Johancsik (1984)", body_s))
        els.append(Paragraph(
            f"Дата формирования: {datetime.datetime.now().strftime('%d.%m.%Y %H:%M')}", body_s))
        els.append(Spacer(1, 10*mm))

        params = [
            ['Параметр',                       'Значение'],
            ['Целевая глубина',                 f'{target_depth} м'],
            ['Плотность бурового раствора',     f'{fluid_density} г/см³'],
            ['Коэф. трения (по умолчанию)',      str(mu_default)],
            ['Количество точек инклинометрии',  str(len(survey))],
            ['Элементов в компоновке',          str(len(assembly))],
        ]
        els.append(_tbl(params, [110*mm, 60*mm]))
        els.append(PageBreak())

        # ═══════════════════════════════════════════════════
        # РАЗДЕЛ 1: ИНКЛИНОМЕТРИЯ
        # ═══════════════════════════════════════════════════
        els.append(Paragraph("1. Инклинометрия скважины", h2_s))
        if survey:
            s_rows = [['Глубина (м)', 'Зенитный угол (°)', 'Азимут (°)']]
            for s in survey[:80]:
                s_rows.append([str(s['depth']), str(s['inclination']), str(s['azimuth'])])
            if len(survey) > 80:
                s_rows.append(['...', f'({len(survey)} точек всего)', ''])
            els.append(_tbl(s_rows, [60*mm, 60*mm, 52*mm]))
        els.append(Spacer(1, 4*mm))

        # ═══════════════════════════════════════════════════
        # РАЗДЕЛ 2: КОМПОНОВКА
        # ═══════════════════════════════════════════════════
        els.append(Paragraph("2. Компоновка низа бурильной колонны (от забоя к устью)", h2_s))
        if assembly:
            a_rows = [['Элемент', 'Длина (м)', 'Вес (кг)', 'OD (мм)', 'Макс. нагрузка (кН)']]
            for e in assembly:
                a_rows.append([e.get('name',''), str(e['length']),
                               str(e['weight_air']), str(e.get('od','')),
                               str(e.get('max_load',''))])
            els.append(_tbl(a_rows, [55*mm, 22*mm, 25*mm, 27*mm, 35*mm]))

            bf = 1.0 - fluid_density / STEEL_DENSITY
            W_air  = sum(e['weight_air'] for e in assembly) * G / 1000.0
            W_buoy = W_air * bf
            els.append(Spacer(1, 2*mm))
            els.append(Paragraph(
                f"Вес в воздухе: {W_air:.1f} кН  |  "
                f"Вес с архимедовой поправкой: {W_buoy:.1f} кН  |  "
                f"Коэф. Архимеда BF = {bf:.3f}", body_s))
        els.append(PageBreak())

        # ═══════════════════════════════════════════════════
        # РАЗДЕЛ 3: TORQUE & DRAG
        # ═══════════════════════════════════════════════════
        els.append(Paragraph("3. Анализ Torque &amp; Drag", h2_s))

        if survey and assembly and target_depth > 0:
            try:
                forces_d, segs_d = johancsik_run(
                    assembly, survey, target_depth, fluid_density,
                    mu_default, mu_intervals, direction='down',
                    centralizers=centralizers)
                forces_u, segs_u = johancsik_run(
                    assembly, survey, target_depth, fluid_density,
                    mu_default, mu_intervals, direction='up',
                    centralizers=centralizers)
                torque_prof = calc_torque_profile(segs_d)
                buckling    = calc_buckling(segs_d)

                hl_rih  = forces_d[-1]['force']  if forces_d  else 0.0
                hl_pooh = forces_u[-1]['force']  if forces_u  else 0.0
                torq_s  = torque_prof[-1]['torque'] if torque_prof else 0.0
                drag_sum_rih  = sum(s['friction'] for s in segs_d)
                drag_sum_pooh = sum(s['friction'] for s in segs_u)

                els.append(Paragraph("3.1 Сводные показатели", h3_s))
                kpi = [
                    ['Показатель', 'Значение'],
                    ['Нагрузка на крюке при спуске (RIH)',     f'{hl_rih:.2f} кН'],
                    ['Нагрузка на крюке при подъёме (POOH)',   f'{hl_pooh:.2f} кН'],
                    ['Крутящий момент на устье',                f'{torq_s:.2f} кН·м'],
                    ['Суммарное трение при спуске',             f'{drag_sum_rih:.2f} кН'],
                    ['Суммарное трение при подъёме',            f'{drag_sum_pooh:.2f} кН'],
                    ['Разница RIH / POOH (окно трения)',        f'{(hl_pooh - hl_rih):.2f} кН'],
                ]
                els.append(_tbl(kpi, [110*mm, 60*mm]))
                els.append(Spacer(1, 4*mm))

                # График 1: Совмещённый T&D (RIH + POOH)
                els.append(Paragraph("3.2 Профили осевых нагрузок (Drag)", h3_s))
                drag_img = _td_drag_chart(forces_d, forces_u)
                els.append(Image(drag_img, width=165*mm, height=95*mm))
                els.append(Spacer(1, 4*mm))

                # График 2: Крутящий момент
                els.append(Paragraph("3.3 Профиль крутящего момента", h3_s))
                torq_img = _td_torque_chart(torque_prof)
                els.append(Image(torq_img, width=165*mm, height=88*mm))
                els.append(Spacer(1, 4*mm))

                # График 3: Трение по элементам
                els.append(Paragraph("3.4 Трение по элементам компоновки", h3_s))
                fric_img = _td_friction_chart(segs_d, segs_u)
                els.append(Image(fric_img, width=165*mm, height=max(60, len(segs_d)*14+20)*mm))
                els.append(Spacer(1, 4*mm))

                # Таблица по элементам
                els.append(Paragraph("3.5 Результаты по элементам", h3_s))
                seg_hdr = ['Элемент', 'Глубина\nверха (м)', 'F_RIH (кН)',
                           'F_POOH (кН)', 'N (кН)', 'Трение↓\n(кН)',
                           'Трение↑\n(кН)', 'Момент ΔT\n(кН·м)']
                seg_rows = [seg_hdr]
                for i, s in enumerate(segs_d):
                    sp_ = segs_u[i] if i < len(segs_u) else {}
                    od = s.get('od', 0); r = od/2000 if od > 0 else 0.08
                    dT = s['mu'] * s['N'] * r
                    seg_rows.append([
                        s['name'], str(s['top']),
                        str(s['F_top']), str(sp_.get('F_top', '—')),
                        str(s['N']), str(s['friction']),
                        str(sp_.get('friction', '—')),
                        f"{dT:.3f}",
                    ])
                els.append(_tbl(seg_rows,
                                [38*mm,17*mm,17*mm,18*mm,14*mm,14*mm,14*mm,16*mm]))
                els.append(Spacer(1, 4*mm))

                # Продольный изгиб
                els.append(Paragraph("3.6 Анализ продольного изгиба", h3_s))
                if not buckling:
                    els.append(Paragraph("✓ Сжатых сегментов не обнаружено — "
                                         "риск потери устойчивости отсутствует.", ok_s))
                else:
                    status_map = {
                        'ok':         ('ОК — ниже порога синус. изгиба', ok_s),
                        'sinusoidal': ('СИНУСОИДАЛЬНЫЙ ИЗГИБ',           warn_s),
                        'helical':    ('⚠ СПИРАЛЬНЫЙ ИЗГИБ',             err_s),
                    }
                    b_hdr = ['Элемент', 'Глубина (м)', 'Сжатие (кН)',
                             'F_cr_sin (кН)', 'F_cr_hel (кН)', 'Статус']
                    b_rows = [b_hdr]
                    for b in buckling:
                        b_rows.append([
                            b['name'],
                            f"{b['top']}–{b['bottom']}",
                            str(b['compression']),
                            str(b['F_cr_sin']),
                            str(b['F_cr_hel']),
                            status_map.get(b['status'], (b['status'], body_s))[0],
                        ])
                    bt = _tbl(b_rows, [40*mm, 28*mm, 24*mm, 24*mm, 24*mm, 32*mm])
                    # Подсветка строк
                    for ri, b in enumerate(buckling, start=1):
                        if b['status'] == 'sinusoidal':
                            bt._cellvalues  # force build
                            bt.setStyle(TableStyle(
                                [('BACKGROUND', (0,ri), (-1,ri), warn_fill)]))
                        elif b['status'] == 'helical':
                            bt.setStyle(TableStyle(
                                [('BACKGROUND', (0,ri), (-1,ri), err_fill)]))
                    els.append(bt)

            except Exception as e:
                els.append(Paragraph(f"Ошибка расчёта T&D: {e}", err_s))

        els.append(PageBreak())

        # ═══════════════════════════════════════════════════
        # РАЗДЕЛ 4: ДОХОДИМОСТЬ
        # ═══════════════════════════════════════════════════
        els.append(Paragraph("4. Доходимость до целевой глубины", h2_s))
        if survey and assembly and target_depth > 0:
            try:
                forces_d2, _ = johancsik_run(
                    assembly, survey, target_depth, fluid_density,
                    mu_default, mu_intervals, direction='down',
                    centralizers=centralizers)
                reaches = all(f['force'] >= 0 for f in forces_d2)
                crit    = next((f['depth'] for f in forces_d2 if f['force'] < 0), None)
                if reaches:
                    els.append(Paragraph(
                        f"✓ КОМПОНОВКА ДОХОДИТ до глубины {target_depth} м", ok_s))
                else:
                    els.append(Paragraph(
                        f"✗ КОМПОНОВКА НЕ ДОХОДИТ. "
                        f"Критическая глубина: {crit} м", err_s))
                els.append(Spacer(1, 3*mm))
                chart_reach = _make_chart_image(forces_d2, 'Осевая нагрузка при спуске')
                els.append(Image(chart_reach, width=165*mm, height=85*mm))
            except Exception as e:
                els.append(Paragraph(f"Ошибка: {e}", err_s))

        els.append(Spacer(1, 6*mm))

        # ═══════════════════════════════════════════════════
        # РАЗДЕЛ 5: ВЕС НА КРЮКЕ
        # ═══════════════════════════════════════════════════
        els.append(Paragraph("5. Вес на крюке при подъёме (POOH)", h2_s))
        if survey and assembly and target_depth > 0:
            try:
                forces_u2, _ = johancsik_run(
                    assembly, survey, target_depth, fluid_density,
                    mu_default, mu_intervals, direction='up',
                    centralizers=centralizers)
                hl = forces_u2[-1]['force'] if forces_u2 else 0
                els.append(Paragraph(f"Нагрузка на крюке: {hl:.2f} кН", body_s))
                els.append(Spacer(1, 2*mm))
                chart_hook = _make_chart_image(forces_u2, 'Вес на крюке при подъёме')
                els.append(Image(chart_hook, width=165*mm, height=85*mm))
            except Exception as e:
                els.append(Paragraph(f"Ошибка: {e}", err_s))

        # ═══════════════════════════════════════════════════
        # РАЗДЕЛ 6: ПАКЕР
        # ═══════════════════════════════════════════════════
        if packer_set_force > 0 and assembly and packer_idx < len(assembly):
            els.append(Spacer(1, 6*mm))
            els.append(Paragraph("6. Усилие срыва пакера", h2_s))
            try:
                packer_top = target_depth - sum(
                    assembly[j]['length'] for j in range(packer_idx + 1))
                aa = assembly[packer_idx + 1:]
                if aa:
                    fp, sp2 = johancsik_run(
                        aa, survey, packer_top, fluid_density,
                        mu_default, mu_intervals, direction='up',
                        initial_force=packer_set_force, centralizers=centralizers)
                    hl_p = fp[-1]['force'] if fp else packer_set_force
                    wk_name, wk_load = '', float('inf')
                    for s in sp2:
                        if s['max_load'] < wk_load:
                            wk_load, wk_name = s['max_load'], s['name']
                    f_max   = max(abs(s['F_top']) for s in sp2) if sp2 else 0
                    safety  = wk_load / f_max * 100 if f_max > 0 else 9999
                    is_safe = f_max <= wk_load
                    pstyle  = ok_s if is_safe else err_s
                    els.append(Paragraph(
                        f"{'✓' if is_safe else '✗'} "
                        f"Нагрузка на крюке для срыва: {hl_p:.2f} кН  |  "
                        f"Слабейший элемент: {wk_name} ({wk_load:.1f} кН)  |  "
                        f"Запас прочности: {safety:.1f}%", pstyle))
            except Exception as e:
                els.append(Paragraph(f"Ошибка: {e}", err_s))

        doc.build(els)
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
        centralizers = data.get('centralizers', [])

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
                mu_default, mu_intervals, direction='down',
                centralizers=centralizers)
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
                mu_default, mu_intervals, direction='up',
                centralizers=centralizers)
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
                        initial_force=packer_set_force, centralizers=centralizers)
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

            # ── Лист «T&D» — полный анализ Torque & Drag ──
            forces_td_d, segs_td_d = johancsik_run(
                assembly, survey, target_depth, fluid_density,
                mu_default, mu_intervals, direction='down',
                centralizers=centralizers)
            forces_td_u, segs_td_u = johancsik_run(
                assembly, survey, target_depth, fluid_density,
                mu_default, mu_intervals, direction='up',
                centralizers=centralizers)
            torque_pr = calc_torque_profile(segs_td_d)
            buckling  = calc_buckling(segs_td_d)

            ws_td = wb.create_sheet('T&D по элементам')
            ht = ['Элемент', 'Верх (м)', 'Низ (м)',
                  'N (кН)', 'F_RIH верх (кН)', 'F_POOH верх (кН)',
                  'Трение RIH (кН)', 'Трение POOH (кН)',
                  'ΔT крут. момент (кН·м)', 'μ']
            ws_td.append(ht)
            _style_header(ws_td, 1, len(ht))
            for i, s in enumerate(segs_td_d):
                sp_ = segs_td_u[i] if i < len(segs_td_u) else {}
                od  = s.get('od', 0); r = od/2000 if od > 0 else 0.08
                dT  = s['mu'] * s['N'] * r
                ws_td.append([
                    s['name'], s['top'], s['bottom'],
                    s['N'], s['F_top'], sp_.get('F_top', ''),
                    s['friction'], sp_.get('friction', ''),
                    round(dT, 3), s['mu'],
                ])
            for col in ws_td.columns:
                ws_td.column_dimensions[col[0].column_letter].width = 18

            ws_torq = wb.create_sheet('Крутящий момент')
            ht2 = ['Глубина (м)', 'Элемент', 'Момент (кН·м)', 'ΔT (кН·м)']
            ws_torq.append(ht2)
            _style_header(ws_torq, 1, len(ht2))
            for tp in torque_pr:
                ws_torq.append([tp['depth'], tp['element'],
                                tp['torque'], tp['dT']])
            for col in ws_torq.columns:
                ws_torq.column_dimensions[col[0].column_letter].width = 20

            if buckling:
                ws_bk = wb.create_sheet('Продольный изгиб')
                hb = ['Элемент', 'Верх (м)', 'Низ (м)',
                      'Сжатие (кН)', 'F_cr_sin (кН)', 'F_cr_hel (кН)', 'Статус']
                ws_bk.append(hb)
                _style_header(ws_bk, 1, len(hb))
                status_ru = {
                    'ok': 'Норма', 'sinusoidal': 'Синус. изгиб', 'helical': 'Спир. изгиб'}
                yellow = PatternFill('solid', fgColor='FFF3CD')
                red    = PatternFill('solid', fgColor='FCE8E8')
                for ri, b in enumerate(buckling, start=2):
                    ws_bk.append([b['name'], b['top'], b['bottom'],
                                  b['compression'], b['F_cr_sin'], b['F_cr_hel'],
                                  status_ru.get(b['status'], b['status'])])
                    if b['status'] == 'sinusoidal':
                        for c in range(1, 8):
                            ws_bk.cell(ri, c).fill = yellow
                    elif b['status'] == 'helical':
                        for c in range(1, 8):
                            ws_bk.cell(ri, c).fill = red
                for col in ws_bk.columns:
                    ws_bk.column_dimensions[col[0].column_letter].width = 18

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
