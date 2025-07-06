// src/components/FormControls.jsx

import React from 'react';

const baseInputClasses = "mt-1 block w-full rounded-md border-0 px-3 py-2 bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 transition-shadow duration-150 sm:text-sm sm:leading-6";

export const FormInput = ({ label, id, type = 'text', ...props }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium leading-6 text-slate-700">
      {label}
    </label>
    <input
      type={type}
      id={id}
      {...props}
      className={`${baseInputClasses} ${props.className || ''}`}
    />
  </div>
);

export const FormTextarea = ({ label, id, rows = "3", ...props }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium leading-6 text-slate-700">
      {label}
    </label>
    <textarea
      id={id}
      rows={rows}
      {...props}
      className={`${baseInputClasses} ${props.className || ''}`}
    ></textarea>
  </div>
);

export const FormSelect = ({ label, id, children, ...props }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium leading-6 text-slate-700">
      {label}
    </label>
    <select
      id={id}
      {...props}
      className={`${baseInputClasses} ${props.className || ''}`}
    >
      {children}
    </select>
  </div>
);